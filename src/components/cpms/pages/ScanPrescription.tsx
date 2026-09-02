"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Input } from "@/components/cpms/ui/input";
import { Textarea } from "@/components/cpms/ui/textarea";
import { Label } from "@/components/cpms/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/cpms/ui/select";
import {
  Activity,
  ArrowLeft,
  Camera,
  CheckCircle,
  FileText,
  Loader2,
  Upload,
  X,
  Plus,
  SkipForward,
  Image as ImageIcon,
  File as FileIcon,
  AlertTriangle,
  Trash2,
  History,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { describeError } from "@/lib/cpms/errors";
import { supabase } from "@/lib/supabase/cpms-client";
import { useAuth } from "@/hooks/cpms/useAuth";
import { useHospitals } from "@/hooks/cpms/useHospitals";
import ImagePreviewViewer from "@/components/cpms/ImagePreviewViewer";
import AdditionalDocumentsUpload, { type CategorizedDocument } from "@/components/cpms/AdditionalDocumentsUpload";
import DocumentProcessor from "@/components/cpms/DocumentProcessor";
import { asset } from "@/lib/cpms/base-path";

interface PriorVisitSummary {
  id: string;
  reference_number: string | null;
  visit_date: string | null;
  diagnosis: string | null;
  // Nullable in the schema like the three above. Selected by the query but not
  // rendered — the banner shows visit_date, reference_number and diagnosis.
  created_at: string | null;
}

interface PriorVisits {
  /** Total earlier records for this Patient ID at this hospital that the current
   *  user is permitted to see. RLS means a standard user counts only their own
   *  uploads, so this can under-report — the wording in the UI reflects that. */
  count: number;
  latest: PriorVisitSummary | null;
}

interface ExtractedData {
  patient_name: string;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  hospital_name: string; // Note: bmi is computed via calculateBMI, not stored in ExtractedData
  doctor_name: string | null;
  diagnosis: string | null;
  medicines: Array<{ name: string; dosage: string; frequency: string; duration: string }>;
  visit_date: string | null;
  uhid: string | null;
  reference_number: string | null;
  confidence_score: number | null;
}

type FlowStep = 'upload' | 'additional-docs' | 'review';

// Calculate BMI from height (cm) and weight (kg), rounded to 2 decimal places
const calculateBMI = (heightCm: number | null, weightKg: number | null): number | null => {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
};

// The extraction prompt instructs the model to return null for anything it
// cannot read, so its response does not actually satisfy ExtractedData's
// non-null string fields. Spreading it in unchecked meant a prescription with,
// say, no duration on one medicine put null straight into a controlled input,
// which React warns about and which leaves the field unable to accept typing.
//
// Normalizing once here keeps that guarantee in one place instead of relying on
// a guard at every binding. Genuinely optional values stay null: the numeric
// inputs already guard them and the database wants null, not "", for an empty
// number or date.
const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
};

const asOptionalText = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

const asOptionalNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeExtractedData = (raw: unknown, hospitalName: string): ExtractedData => {
  const source = (raw ?? {}) as Record<string, unknown>;
  const rawMedicines = Array.isArray(source.medicines) ? source.medicines : [];

  return {
    patient_name: asText(source.patient_name),
    age: asOptionalNumber(source.age),
    gender: asOptionalText(source.gender),
    height_cm: asOptionalNumber(source.height_cm),
    weight_kg: asOptionalNumber(source.weight_kg),
    hospital_name: hospitalName,
    doctor_name: asOptionalText(source.doctor_name),
    diagnosis: asOptionalText(source.diagnosis),
    medicines: rawMedicines.map((medicine) => {
      const med = (medicine ?? {}) as Record<string, unknown>;
      return {
        name: asText(med.name),
        dosage: asText(med.dosage),
        frequency: asText(med.frequency),
        duration: asText(med.duration),
      };
    }),
    visit_date: asOptionalText(source.visit_date),
    uhid: asOptionalText(source.uhid),
    reference_number: asOptionalText(source.reference_number),
    confidence_score: asOptionalNumber(source.confidence_score),
  };
};

// Generate reference number in format: <FirstLetterOfHospital><MMYY><ScanNumber>
// Example: Fortis Hospital + 30/01/2026 + Scan No. 2 → F01262
const generateReferenceNumber = async (hospitalName: string): Promise<string> => {
  const { data, error } = await supabase.rpc("generate_reference_number", {
    _hospital: hospitalName,
  });
  if (error || !data) {
    // Deliberately not `error.message`: a failure inside
    // generate_reference_number() reports the function and column names, and
    // this Error is rendered straight into a toast.
    if (error) console.error("[cpms] generate_reference_number failed:", error.code);
    throw new Error("Could not generate a reference number. Please try again.");
  }
  return data as string;
};

const ScanPrescription = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { hospitalOptions } = useHospitals();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Camera state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Step tracking
  const [currentStep, setCurrentStep] = useState<FlowStep>('upload');
  
  // Main prescription
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedHospital, setSelectedHospital] = useState("");
  const [patientId, setPatientId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Document processing state
  const [showDocProcessor, setShowDocProcessor] = useState(false);
  const [rawPreview, setRawPreview] = useState<string | null>(null);
  
  // Additional documents
  const [additionalDocs, setAdditionalDocs] = useState<CategorizedDocument[]>([]);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);

  // Prior visits for this Patient ID at this hospital
  const [priorVisits, setPriorVisits] = useState<PriorVisits | null>(null);
  const [checkingPriorVisits, setCheckingPriorVisits] = useState(false);

  // Look up earlier records for the same Patient ID + hospital so staff notice a
  // returning patient instead of silently creating an unlinked duplicate.
  // Debounced because it fires on every keystroke in the Patient ID field.
  useEffect(() => {
    const pid = patientId.trim();
    if (!pid || !selectedHospital) {
      setPriorVisits(null);
      return;
    }

    let cancelled = false;
    setCheckingPriorVisits(true);

    const timer = setTimeout(async () => {
      const { data, error, count } = await supabase
        .from("patient_records")
        .select("id, reference_number, visit_date, diagnosis, created_at", { count: "exact" })
        .eq("hospital", selectedHospital)
        .eq("patient_id", pid)
        .order("visit_date", { ascending: false })
        .limit(1);

      if (cancelled) return;
      setCheckingPriorVisits(false);

      if (error) {
        // A failed lookup must never block the scan — just show nothing.
        // The code, not the message: this runs in the browser, and the message
        // would name the table and the policy that refused the read.
        console.error("[cpms] prior visit lookup failed:", error.code);
        setPriorVisits(null);
        return;
      }

      if (!count) {
        setPriorVisits(null);
        return;
      }

      setPriorVisits({ count, latest: data?.[0] ?? null });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientId, selectedHospital]);

  // Generate reference number when hospital is selected
  const handleHospitalChange = async (hospital: string) => {
    setSelectedHospital(hospital);
    if (hospital) {
      const ref = await generateReferenceNumber(hospital);
      setReferenceNumber(ref);
    } else {
      setReferenceNumber("");
    }
  };

  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];

  const handleFileSelect = (file: File) => {
    // Clear previous error
    setFileError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      const ext = file.name.split(".").pop()?.toUpperCase() || "Unknown";
      const msg = `Unsupported file type: ${ext}. Please upload a JPG, PNG, or PDF.`;
      setFileError(msg);
      toast.error(msg);
      // Reset native input so the same file can be reselected after fixing
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      const msg = `File too large (${sizeMb} MB). Maximum size is 10 MB.`;
      setFileError(msg);
      toast.error(msg);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onerror = () => {
        setFileError("Could not read the selected image. Please try again.");
      };
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setRawPreview(dataUrl);
        setPreview(dataUrl);
        setShowDocProcessor(true);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
      setRawPreview(null);
      setShowDocProcessor(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const clearFile = () => {
    setSelectedFile(null);
    setPreview(null);
    setExtractedData(null);
    setUploadedImageUrl(null);
    setFileError(null);
    setShowDocProcessor(false);
    setRawPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Camera functions
  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setStream(mediaStream);
      setIsCameraOpen(true);
      
      // Wait for video element to be mounted
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (error) {
      console.error('Camera access error:', error);
      toast.error("Unable to access camera. Please check permissions or use file upload instead.");
    }
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `prescription-${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleFileSelect(file);
        closeCamera();
        toast.success("Photo captured successfully!");
      }
    }, 'image/jpeg', 0.9);
  };

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Downscale before sending to the model. This function always promised
  // preprocessing but the old body just base64'd the original, so a 4MB phone
  // photo became a ~5.5MB payload that crossed the wire twice - once to the
  // Edge Function, then on to Gemini - and could trip the function's 10MB
  // guard on a high-megapixel capture. Prescriptions are text: 1600px on the
  // long edge is more than the model needs to read one, and it cuts a typical
  // phone photo to a few hundred KB.
  const preprocessImage = async (file: File): Promise<string> => {
    const MAX_IMAGE_DIMENSION = 1600;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read the selected file"));
      reader.readAsDataURL(file);
    });

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not decode the selected image"));
        img.src = dataUrl;
      });

      const longestEdge = Math.max(image.width, image.height);
      if (longestEdge <= MAX_IMAGE_DIMENSION) {
        return dataUrl;
      }

      const scale = MAX_IMAGE_DIMENSION / longestEdge;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) return dataUrl;

      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
      // Any failure in the canvas path is not worth failing the scan over -
      // the full-size original still extracts correctly, just more slowly.
      return dataUrl;
    }
  };

  const processWithAI = async () => {
    if (!selectedFile || !selectedHospital || !patientId.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsProcessing(true);

    try {
      // The archive upload and the extraction both need the file but not each
      // other's result, so they run concurrently. Previously the user waited
      // for the full-size original to finish uploading before the model was
      // even asked to start.
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

      const uploadPromise = supabase.storage
        .from('prescriptions')
        .upload(fileName, selectedFile);

      // Preprocess and convert file to base64 for AI processing
      const base64 = await preprocessImage(selectedFile);

      // Call edge function for AI extraction with OCR
      const [uploadResult, extraction] = await Promise.all([
        uploadPromise,
        supabase.functions.invoke('extract-prescription', {
          body: { imageBase64: base64 }
        }),
      ]);

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      setUploadedImageUrl(fileName);

      const { data, error } = extraction;

      if (error) {
        // supabase-js wraps the raw Response in error.context — parse it to get
        // the actual message the function returned instead of the generic
        // "Edge Function returned a non-2xx status code" string.
        //
        // Only `body.error` is read, and only that. The function writes it for
        // this screen ("Image size exceeds 10MB limit", "Service temporarily
        // busy"); anything else it might return is internal.
        let realMessage = '';
        try {
          const ctx = (error as unknown as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (typeof body?.error === 'string') realMessage = body.error;
          }
        } catch { /* body was not JSON — fall through to the generic message */ }
        // No parsed message means the function never got to answer, so throw the
        // original and let describeError() decide what that looked like.
        if (!realMessage) throw error;
        throw new Error(realMessage);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to extract data');
      }

      const extractedResult = normalizeExtractedData(data.data, selectedHospital);

      setExtractedData(extractedResult);
      toast.success("Prescription data extracted successfully!");
      
      // Move to additional documents step
      setCurrentStep('additional-docs');
    } catch (error) {
      toast.error(describeError(error, 'Could not read that prescription. Please try again.'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload additional documents to storage
  const uploadAdditionalDocs = async (): Promise<Array<{ name: string; url: string; type: string; docType: string }>> => {
    const uploadedDocs: Array<{ name: string; url: string; type: string; docType: string }> = [];
    const readyDocs = additionalDocs.filter((d) => d.status === "ready");
    
    for (const doc of readyDocs) {
      const fileExt = doc.file.name.split('.').pop();
      const fileName = `${user?.id}/additional/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('prescriptions')
        .upload(fileName, doc.file);
      
      if (error) {
        console.error(`Failed to upload ${doc.file.name}:`, error);
        continue;
      }
      
      uploadedDocs.push({
        name: doc.file.name,
        url: fileName,
        type: doc.file.type.includes('pdf') ? 'PDF' : 'Image',
        docType: doc.docType,
      });
    }
    
    return uploadedDocs;
  };

  const proceedToReview = () => {
    const hasErrors = additionalDocs.some((d) => d.status === "error");
    const hasCompressing = additionalDocs.some((d) => d.status === "compressing");
    if (hasCompressing) {
      toast.error("Please wait for file optimization to complete");
      return;
    }
    if (hasErrors && additionalDocs.filter((d) => d.status === "ready").length === 0) {
      toast.error("No valid documents. Please fix errors or add new files.");
      return;
    }
    setCurrentStep('review');
  };

  const skipAdditionalDocs = () => {
    setCurrentStep('review');
  };

  const goBackToAdditionalDocs = () => {
    setCurrentStep('additional-docs');
  };

  const saveToDatabase = async () => {
    if (!extractedData || !user) {
      toast.error("Please ensure you're logged in and data is extracted");
      return;
    }

    if (!selectedHospital) {
      toast.error("Please select a hospital before saving");
      return;
    }

    if (!patientId.trim()) {
      toast.error("Please enter a Patient ID");
      return;
    }

    setIsProcessing(true);

    try {
      // Upload additional documents if any
      let additionalDocsData: Array<{ name: string; url: string; type: string }> = [];
      if (additionalDocs.length > 0) {
        setIsUploadingDocs(true);
        additionalDocsData = await uploadAdditionalDocs();
        setIsUploadingDocs(false);
      }

      // Generate reference number and insert with retry on unique-violation
      let insertError: any = null;
      let freshRef = "";
      const MAX_ATTEMPTS = 5;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        freshRef = await generateReferenceNumber(selectedHospital);

        const { error } = await supabase.from('patient_records').insert({
          patient_id: patientId.trim(),
          patient_name: extractedData.patient_name,
          age: extractedData.age ? Math.round(Number(extractedData.age)) : null,
          gender: extractedData.gender,
          height_cm: extractedData.height_cm ? Number(extractedData.height_cm) : null,
          weight_kg: extractedData.weight_kg ? Number(extractedData.weight_kg) : null,
          bmi: calculateBMI(extractedData.height_cm, extractedData.weight_kg),
          hospital: selectedHospital,
          doctor_name: extractedData.doctor_name,
          diagnosis: extractedData.diagnosis,
          medicines: extractedData.medicines,
          visit_date: extractedData.visit_date || new Date().toISOString().split('T')[0],
          prescription_image_url: uploadedImageUrl,
          uploaded_by: user.id,
          additional_documents: additionalDocsData,
          reference_number: freshRef,
          uhid: extractedData.uhid,
          confidence_score: extractedData.confidence_score,
        });

        if (!error) {
          insertError = null;
          break;
        }

        const isDupRef =
          (error as any).code === '23505' &&
          (error.message?.includes('patient_records_reference_number_key') ||
            error.message?.includes('reference_number'));

        if (isDupRef && attempt < MAX_ATTEMPTS) {
          // Brief jitter, then regenerate and retry
          await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
          continue;
        }

        insertError = error;
        break;
      }

      setReferenceNumber(freshRef);

      if (insertError) {
        // The attachments were uploaded before the insert, and uploadAdditionalDocs()
        // re-uploads every "ready" doc to a fresh randomised path on each attempt.
        // Without this, each failed save leaves a full duplicate set in the bucket
        // with no record referencing it — invisible to the audit trail.
        // The main prescription image is deliberately left in place: it is uploaded
        // during extraction and a retry of this save still points at it.
        if (additionalDocsData.length > 0) {
          const orphanedPaths = additionalDocsData.map((d) => d.url).filter(Boolean);
          if (orphanedPaths.length > 0) {
            const { error: cleanupError } = await supabase.storage
              .from('prescriptions')
              .remove(orphanedPaths);
            if (cleanupError) {
              console.error('[cpms] failed to clean up orphaned uploads:', cleanupError.name);
            }
          }
        }

        if (insertError.message?.includes('row-level security policy')) {
          toast.error("Access denied: You don't have permission to add records for this hospital. Please contact your administrator.");
        } else if (
          (insertError as any).code === '23505' &&
          (insertError.message?.includes('patient_records_reference_number_key') ||
            insertError.message?.includes('reference_number'))
        ) {
          toast.error("Could not generate a unique reference number. Please try again.");
        } else {
          toast.error(describeError(insertError, 'Could not save the patient record. Please try again.'));
        }
        return;
      }

      setIsSuccess(true);
      toast.success("Patient data saved successfully!");
    } catch (error) {
      toast.error(describeError(error, 'Could not save the patient record. Please try again.'));
    } finally {
      setIsProcessing(false);
      setIsUploadingDocs(false);
    }
  };

  const resetForm = () => {
    clearFile();
    setSelectedHospital("");
    setPatientId("");
    setReferenceNumber("");
    setExtractedData(null);
    setIsSuccess(false);
    setUploadedImageUrl(null);
    setAdditionalDocs([]);
    setCurrentStep('upload');
    setShowDocProcessor(false);
    setRawPreview(null);
  };

  // Step indicator component
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
        currentStep === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
      }`}>
        <span className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-xs">1</span>
        OCR
      </div>
      <div className="w-8 h-0.5 bg-border" />
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
        currentStep === 'additional-docs' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
      }`}>
        <span className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-xs">2</span>
        Documents
      </div>
      <div className="w-8 h-0.5 bg-border" />
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
        currentStep === 'review' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
      }`}>
        <span className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-xs">3</span>
        Review
      </div>
    </div>
  );

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 bg-primary flex items-center justify-center">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl tracking-tight">Scan Complete</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 flex items-center justify-center">
          <Card className="max-w-lg w-full border-2">
            <CardContent className="p-8 text-center space-y-6">
              <div className="h-20 w-20 bg-accent mx-auto flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-accent-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Success!</h2>
                <p className="text-muted-foreground">
                  Patient data has been saved to {extractedData?.hospital_name} records.
                </p>
              </div>
              <div className="bg-secondary p-4 text-left space-y-2">
                <p className="text-sm">
                  <span className="font-semibold">Reference No:</span>{' '}
                  <span className="font-mono">{referenceNumber}</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Patient ID:</span> {patientId}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Patient:</span> {extractedData?.patient_name}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Diagnosis:</span> {extractedData?.diagnosis || 'N/A'}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Hospital:</span> {extractedData?.hospital_name}
                </p>
                {additionalDocs.length > 0 && (
                  <p className="text-sm">
                    <span className="font-semibold">Additional Documents:</span> {additionalDocs.length} uploaded
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={resetForm} className="flex-1">
                  Scan Another
                </Button>
                <Button onClick={() => router.push(asset("/patients"))} variant="outline" className="flex-1">
                  View Records
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-primary flex items-center justify-center">
              <Activity className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">Scan Prescription</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <StepIndicator />

          {/* STEP 1: OCR Upload */}
          {currentStep === 'upload' && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Step 1: Upload Prescription</CardTitle>
                <CardDescription>
                  Upload a handwritten prescription for AI-powered OCR extraction
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!selectedFile ? (
                  <div
                    className={`border-2 border-dashed p-6 sm:p-8 text-center transition-colors cursor-pointer ${
                      isDragging
                        ? "border-primary bg-accent"
                        : fileError
                        ? "border-destructive bg-destructive/5"
                        : "border-border hover:border-primary"
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/jpg,application/pdf"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    <Upload className={`h-12 w-12 mx-auto mb-4 ${fileError ? "text-destructive" : "text-muted-foreground"}`} />
                    <p className="font-medium mb-2">Drag & drop your prescription here</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Supports JPG, PNG, PDF (max 10MB)
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button type="button" variant="outline" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Choose File
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCamera();
                        }}
                      >
                        <Camera className="h-4 w-4" />
                        Take Photo
                      </Button>
                    </div>
                    
                    {/* Camera Modal */}
                    {isCameraOpen && (
                      <div 
                        className="fixed inset-0 z-50 bg-background/95 flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between p-4 border-b border-border">
                          <h3 className="font-semibold text-lg">Take Photo</h3>
                          <Button variant="ghost" size="icon" onClick={closeCamera}>
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="max-w-full max-h-full object-contain border-2 border-border"
                          />
                          <canvas ref={canvasRef} className="hidden" />
                        </div>
                        <div className="p-4 border-t border-border flex justify-center gap-4">
                          <Button variant="outline" onClick={closeCamera}>
                            Cancel
                          </Button>
                          <Button onClick={capturePhoto} className="gap-2">
                            <Camera className="h-4 w-4" />
                            Capture
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Document Processor overlay */}
                    {showDocProcessor && rawPreview && (
                      <DocumentProcessor
                        imageSrc={rawPreview}
                        onAccept={(processedFile, processedPreview) => {
                          setSelectedFile(processedFile);
                          setPreview(processedPreview);
                          setShowDocProcessor(false);
                          toast.success("Image processed successfully!");
                        }}
                        onSkip={() => {
                          setShowDocProcessor(false);
                        }}
                      />
                    )}

                    {!showDocProcessor && preview ? (
                      <ImagePreviewViewer
                        src={preview}
                        alt="Prescription preview"
                        className="w-full h-[320px] sm:h-[420px]"
                        topRightSlot={
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-9 w-9 shadow-md"
                            onClick={clearFile}
                            aria-label="Remove file"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        }
                      />
                    ) : (
                      <div className="relative w-full h-48 border-2 border-border bg-secondary flex flex-col items-center justify-center gap-2">
                        <FileText className="h-16 w-16 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">PDF preview not available</p>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-9 w-9"
                          onClick={clearFile}
                          aria-label="Remove file"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {!showDocProcessor && (
                    <p className="text-sm text-muted-foreground truncate">
                      <span className="font-medium text-foreground">{selectedFile.name}</span>
                      {" "}({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                    )}
                  </div>
                )}

                {/* Inline file error state */}
                {fileError && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 p-3 border-2 border-destructive bg-destructive/5 rounded-md"
                  >
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-destructive">Upload failed</p>
                      <p className="text-sm text-destructive/90 break-words">{fileError}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Allowed: JPG, PNG, PDF · Max 10 MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setFileError(null)}
                      aria-label="Dismiss error"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Patient ID/UHID */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Patient ID / UHID *</label>
                  <input
                    type="text"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="Enter Patient ID or UHID"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {/* Hospital Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Hospital *</label>
                  <Select value={selectedHospital} onValueChange={handleHospitalChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose hospital for this record" />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitalOptions.map((hospital) => (
                        <SelectItem key={hospital.value} value={hospital.value}>
                          {hospital.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Returning patient notice */}
                {priorVisits && priorVisits.count > 0 && (
                  <div className="border-2 border-primary bg-accent/40 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <History className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          Returning patient — {priorVisits.count} earlier{" "}
                          {priorVisits.count === 1 ? "record" : "records"} at {selectedHospital}
                        </p>
                        {priorVisits.latest && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Most recent:{" "}
                            {priorVisits.latest.visit_date
                              ? new Date(priorVisits.latest.visit_date).toLocaleDateString()
                              : "date unknown"}
                            {priorVisits.latest.reference_number
                              ? ` · ${priorVisits.latest.reference_number}`
                              : ""}
                            {priorVisits.latest.diagnosis ? ` · ${priorVisits.latest.diagnosis}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(asset(`/patients/timeline/${encodeURIComponent(selectedHospital)}/${encodeURIComponent(patientId.trim())}`))
                        }
                      >
                        View patient history
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      This is expected for a follow-up visit. Check the Patient ID is correct if you
                      did not expect earlier records.
                    </p>
                  </div>
                )}
                {checkingPriorVisits && !priorVisits && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking for earlier records…
                  </p>
                )}

                {/* Reference Number (Auto-generated) */}
                {referenceNumber && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reference Number</label>
                    <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm font-mono">
                      {referenceNumber}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Auto-generated reference for tracking this prescription
                    </p>
                  </div>
                )}

                {/* Process Button */}
                <Button
                  className="w-full h-12"
                  disabled={!selectedFile || !selectedHospital || !patientId.trim() || isProcessing}
                  onClick={processWithAI}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Extracting with OCR...
                    </>
                  ) : (
                    "Extract Data with AI"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: Additional Documents */}
          {currentStep === 'additional-docs' && (
            <Card className="border-2 w-full max-w-full overflow-hidden box-border">
              <CardHeader>
                <CardTitle>Step 2: Additional Documents</CardTitle>
                <CardDescription>
                  Upload supporting documents categorized by type. Files are automatically compressed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 min-w-0">
                <AdditionalDocumentsUpload
                  documents={additionalDocs}
                  onChange={setAdditionalDocs}
                />

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={skipAdditionalDocs}
                  >
                    <SkipForward className="h-4 w-4" />
                    Skip & Continue
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={proceedToReview}
                  >
                    Continue to Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Review */}
          {currentStep === 'review' && extractedData && (
            <Card className={`border-2 ${(extractedData.confidence_score || 0) < 70 ? 'border-yellow-500' : 'border-primary'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-accent-foreground" />
                  Step 3: Review & Edit
                </CardTitle>
                <CardDescription>
                  Review and correct the extracted information before saving
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-patient-id">Patient ID</Label>
                        <Input id="edit-patient-id" value={patientId} disabled className="font-mono bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-patient-name">Patient Name *</Label>
                        <Input 
                          id="edit-patient-name" 
                          value={extractedData.patient_name} 
                          onChange={(e) => setExtractedData({...extractedData, patient_name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-age">Age</Label>
                        <Input 
                          id="edit-age" 
                          type="number"
                          value={extractedData.age || ''} 
                          onChange={(e) => setExtractedData({...extractedData, age: e.target.value ? parseInt(e.target.value) : null})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-gender">Gender</Label>
                        <Select value={extractedData.gender || ''} onValueChange={(val) => setExtractedData({...extractedData, gender: val})}>
                          <SelectTrigger id="edit-gender">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-height">Height (cm)</Label>
                        <Input 
                          id="edit-height" 
                          type="number"
                          value={extractedData.height_cm || ''} 
                          onChange={(e) => setExtractedData({...extractedData, height_cm: e.target.value ? parseFloat(e.target.value) : null})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-weight">Weight (kg)</Label>
                        <Input 
                          id="edit-weight" 
                          type="number"
                          value={extractedData.weight_kg || ''} 
                          onChange={(e) => setExtractedData({...extractedData, weight_kg: e.target.value ? parseFloat(e.target.value) : null})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-bmi">BMI (auto-calculated)</Label>
                        <Input 
                          id="edit-bmi" 
                          type="text"
                          value={calculateBMI(extractedData.height_cm, extractedData.weight_kg) ?? 'N/A'} 
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-hospital">Hospital</Label>
                        <Input id="edit-hospital" value={extractedData.hospital_name} disabled className="bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-doctor">Doctor Name</Label>
                        <Input 
                          id="edit-doctor" 
                          value={extractedData.doctor_name || ''} 
                          onChange={(e) => setExtractedData({...extractedData, doctor_name: e.target.value || null})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-visit-date">Visit Date</Label>
                        <Input 
                          id="edit-visit-date" 
                          type="date"
                          value={extractedData.visit_date || ''} 
                          onChange={(e) => setExtractedData({...extractedData, visit_date: e.target.value || null})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Confidence Score</Label>
                        <div className="flex items-center gap-2 h-10">
                          <span className={`font-medium ${(extractedData.confidence_score || 0) >= 85 ? 'text-green-600' : (extractedData.confidence_score || 0) >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {extractedData.confidence_score || 0}%
                          </span>
                          {(extractedData.confidence_score || 0) < 70 && (
                            <span className="text-xs text-muted-foreground">(Low - Please verify)</span>
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2 space-y-2">
                        <Label htmlFor="edit-diagnosis">Diagnosis</Label>
                        <Textarea 
                          id="edit-diagnosis" 
                          value={extractedData.diagnosis || ''} 
                          onChange={(e) => setExtractedData({...extractedData, diagnosis: e.target.value || null})}
                          rows={2}
                        />
                      </div>
                    </div>

                    {/* Editable Medicines */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Medicines</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setExtractedData({
                            ...extractedData,
                            medicines: [...(extractedData.medicines || []), { name: '', dosage: '', frequency: '', duration: '' }]
                          })}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add Medicine
                        </Button>
                      </div>
                      {extractedData.medicines && extractedData.medicines.length > 0 ? (
                        extractedData.medicines.map((med, index) => (
                          <div key={index} className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-secondary border border-border">
                            <Input 
                              placeholder="Medicine name"
                              value={med.name} 
                              onChange={(e) => {
                                const newMeds = [...extractedData.medicines];
                                newMeds[index] = {...newMeds[index], name: e.target.value};
                                setExtractedData({...extractedData, medicines: newMeds});
                              }}
                              className="col-span-2 sm:col-span-1"
                            />
                            <Input 
                              placeholder="Dosage"
                              value={med.dosage} 
                              onChange={(e) => {
                                const newMeds = [...extractedData.medicines];
                                newMeds[index] = {...newMeds[index], dosage: e.target.value};
                                setExtractedData({...extractedData, medicines: newMeds});
                              }}
                            />
                            <Input 
                              placeholder="Frequency"
                              value={med.frequency} 
                              onChange={(e) => {
                                const newMeds = [...extractedData.medicines];
                                newMeds[index] = {...newMeds[index], frequency: e.target.value};
                                setExtractedData({...extractedData, medicines: newMeds});
                              }}
                            />
                            <Input 
                              placeholder="Duration"
                              value={med.duration} 
                              onChange={(e) => {
                                const newMeds = [...extractedData.medicines];
                                newMeds[index] = {...newMeds[index], duration: e.target.value};
                                setExtractedData({...extractedData, medicines: newMeds});
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                const newMeds = extractedData.medicines.filter((_, i) => i !== index);
                                setExtractedData({...extractedData, medicines: newMeds});
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-sm p-3 bg-secondary">No medicines extracted - click "Add Medicine" to add</p>
                      )}
                    </div>

                {/* Additional documents summary */}
                {additionalDocs.filter((d) => d.status === "ready").length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Additional Documents</p>
                    <div className="flex flex-wrap gap-2">
                      {additionalDocs.filter((d) => d.status === "ready").map((doc) => (
                        <div key={doc.id} className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded">
                          {doc.file.type === 'application/pdf' ? (
                            <FileIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-xs text-muted-foreground">{doc.docType}</span>
                          <span className="text-sm truncate max-w-[120px]">{doc.file.name}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto"
                      onClick={goBackToAdditionalDocs}
                    >
                      + Add more documents
                    </Button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={goBackToAdditionalDocs}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 h-12"
                    onClick={saveToDatabase}
                    disabled={isProcessing || !extractedData.patient_name.trim()}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {isUploadingDocs ? 'Uploading Documents...' : 'Saving to Records...'}
                      </>
                    ) : (
                      "Save to Hospital Records"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Button - Step 1 */}
      {currentStep === 'upload' && selectedFile && selectedHospital && patientId.trim() && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-card border-t-2 border-border safe-area-pb">
          <Button
            className="w-full h-14 text-base"
            disabled={isProcessing}
            onClick={processWithAI}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              "Extract Data with AI"
            )}
          </Button>
        </div>
      )}

      {/* Spacer for mobile fixed button */}
      {currentStep === 'upload' && selectedFile && selectedHospital && patientId.trim() && (
        <div className="lg:hidden h-24" />
      )}
    </div>
  );
};

export default ScanPrescription;

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
import { useRole } from "@/hooks/cpms/useRole";
import ImagePreviewViewer from "@/components/cpms/ImagePreviewViewer";
import { assessImageQuality, qualityWarning, type ImageQuality } from "@/lib/cpms/image-quality";
import AdditionalDocumentsUpload, { type CategorizedDocument } from "@/components/cpms/AdditionalDocumentsUpload";
import DocumentCamera from "@/components/cpms/DocumentCamera";
import DocumentProcessor from "@/components/cpms/DocumentProcessor";
import { asset } from "@/lib/cpms/base-path";
import type { Json } from "@shared/supabase-types";
import {
  type ExtractedData,
  calculateBMI,
  localToday,
  normalizeExtractedData,
} from "@/lib/cpms/scan-reading";
import { matchMedicineName, normMedicineName } from "@/lib/cpms/medicine-names";

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

type FlowStep = 'upload' | 'additional-docs' | 'review';

interface ExtraPage {
  id: string;
  file: File;
  preview: string;
  /** Blur/darkness check; undefined while it runs, null if it could not. */
  quality?: ImageQuality | null;
}

/** Pages after the first; the Edge Function accepts four in total. */
const MAX_EXTRA_PAGES = 3;

/** The confirmation key for a medicine row. */
const medicineKey = (id: string) => `medicine:${id}`;

/** The confirmation key for a top-level field the model flagged as unclear. */
const fieldKey = (field: string) => `field:${field}`;

/**
 * Fields the model can flag as unclear, as named in the "still to confirm" list.
 * patient_name has its own confirmation already; uhid is not an input here --
 * a disagreement with the Patient ID has its own warning.
 */
const UNCLEAR_FIELD_LABELS: Record<string, string> = {
  age: 'age',
  gender: 'gender',
  height_cm: 'height',
  weight_kg: 'weight',
  doctor_name: 'doctor name',
  diagnosis: 'diagnosis',
  visit_date: 'visit date',
};

const MEDICINE_PART_LABELS: Record<string, string> = {
  name: 'name',
  dosage: 'dosage',
  frequency: 'frequency',
  duration: 'duration',
};

/** Highlight for a value the model said it could not read with certainty. */
const UNCLEAR_INPUT = 'border-yellow-600 ring-1 ring-yellow-600';

const UnclearNote = () => (
  <span className="ml-2 text-[11px] font-medium text-yellow-700">Unclear on the page</span>
);

/**
 * The confirm/checked toggle beside a reviewed field.
 *
 * Module scope, not the render body. Declared inside the component it was a new
 * component *type* on every render, so React unmounted and remounted every one
 * of these buttons whenever any review state changed -- which drops keyboard
 * focus to <body> mid-review and loses the aria-pressed announcement.
 */
const VerifyCheck = ({
  done,
  label = 'Confirm',
  onToggle,
}: {
  done: boolean;
  label?: string;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={done}
    className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 text-xs font-medium border transition-colors ${
      done
        ? 'border-green-600 text-green-700 bg-green-500/10'
        : 'border-yellow-600 text-yellow-700 bg-yellow-500/10 hover:bg-yellow-500/20'
    }`}
  >
    <CheckCircle className={`h-3 w-3 ${done ? '' : 'opacity-40'}`} />
    {done ? 'Checked' : label}
  </button>
);

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
  const { canScan, canAccessHospital, loading: roleLoading } = useRole();

  // Every enabled account can read the whole hospital list, but
  // patient_records' insert policy requires user_has_hospital_access(). An
  // unassigned hospital could therefore be picked here and only refused by the
  // final insert -- after the extraction call and the upload had already
  // happened. Offer only the hospitals that will actually save.
  const permittedHospitals = hospitalOptions.filter((h) => canAccessHospital(h.value));
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Camera state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  // One camera serves page 1 and the extra pages.
  const [cameraTarget, setCameraTarget] = useState<'main' | 'page'>('main');

  // Pages 2..n of a multi-page prescription. All pages go to the model in one
  // call and are read as one prescription; on save, page 1 is the record's
  // prescription image and these are filed as "Additional Prescription".
  const [extraPages, setExtraPages] = useState<ExtraPage[]>([]);
  const extraPageInputRef = useRef<HTMLInputElement>(null);
  // Which page the Review step is showing.
  const [reviewPage, setReviewPage] = useState(0);
  
  // Step tracking
  const [currentStep, setCurrentStep] = useState<FlowStep>('upload');
  
  // Main prescription
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedHospital, setSelectedHospital] = useState("");
  const [patientId, setPatientId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  // Extraction has been running long enough to say why: with the busy-model
  // retries in extract-prescription it can take 10-20s, and a bare spinner for
  // that long looks like a hang.
  const [extractSlow, setExtractSlow] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Document processing state
  const [showDocProcessor, setShowDocProcessor] = useState(false);
  const [rawPreview, setRawPreview] = useState<string | null>(null);
  
  // Additional documents
  const [additionalDocs, setAdditionalDocs] = useState<CategorizedDocument[]>([]);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);

  // Minted when an extraction lands and held until the scan is reset, so
  // pressing Save twice -- or retrying after a timeout that had in fact
  // succeeded -- resolves to one record instead of two. create_patient_record()
  // keys on it through patient_records.draft_id.
  const [draftId, setDraftId] = useState<string | null>(null);
  // The draft whose save last reached create_patient_record. draftId alone cannot
  // say whether a save is a retry: it is minted at extraction, so it is already
  // set on the very first press of Save.
  const attemptedDraftRef = useRef<string | null>(null);
  // How many documents the saved record actually holds. The success card used
  // to render additionalDocs.length -- the local pick list, which includes any
  // that failed validation and never went anywhere.
  const [savedDocCount, setSavedDocCount] = useState(0);

  // What the model returned, before any correction. Sent with the commit so the
  // record carries its own provenance: without it a saved record cannot be told
  // apart from one a human typed from scratch.
  const [extractionRaw, setExtractionRaw] = useState<Json | null>(null);

  // Fields the model filled have to be looked at before they can be saved.
  // Editing one counts as looking; so does pressing its own control.
  //
  // This is what replaces confidence_score as the gate. The extraction prompt
  // tells the model to "Be generous with scoring" and that a reading with a
  // name and one medicine "should be at least 70", so the number is engineered
  // above the threshold the UI used to check it against and cannot flag a bad
  // read. A human confirming the two fields that matter clinically can.
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());

  const markVerified = (key: string) =>
    setVerifiedFields((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const toggleVerified = (key: string) =>
    setVerifiedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

  // A record for this patient, hospital and visit date already exists -- most
  // often the same prescription scanned a second time. Checked in Review, where
  // the visit date is known, and never blocks the save.
  const [sameDayRecord, setSameDayRecord] = useState<{ reference_number: string | null } | null>(null);
  const reviewVisitDate = extractedData?.visit_date ?? null;

  useEffect(() => {
    const pid = patientId.trim();
    if (currentStep !== 'review' || !pid || !selectedHospital) {
      setSameDayRecord(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("patient_records")
        .select("reference_number")
        .eq("hospital", selectedHospital)
        .eq("patient_id", pid)
        // Saving with no date records today, so today is the date to check.
        .eq("visit_date", reviewVisitDate ?? localToday())
        .limit(1);

      if (cancelled) return;
      if (error) {
        console.error("[cpms] same-day record lookup failed:", error.code);
        setSameDayRecord(null);
        return;
      }
      setSameDayRecord(data?.[0] ?? null);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentStep, patientId, selectedHospital, reviewVisitDate]);

  // Medicine names from earlier records, for suggestions and a spelling check in
  // Review. A misread drug name is the costliest error this flow can save.
  // RLS decides which records are visible, so a standard user draws on their own
  // uploads and an admin on their hospitals'. Loaded once, on reaching Review.
  const [knownMedicines, setKnownMedicines] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    if (currentStep !== 'review' || knownMedicines) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("patient_records")
        .select("medicines")
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        // Suggestions are a help, never a gate.
        console.error("[cpms] medicine name lookup failed:", error.code);
        setKnownMedicines(new Map());
        return;
      }
      // normalised key -> the spelling most recently saved
      const names = new Map<string, string>();
      for (const row of data ?? []) {
        if (!Array.isArray(row.medicines)) continue;
        for (const med of row.medicines as Array<{ name?: unknown }>) {
          const name = typeof med?.name === 'string' ? med.name.trim() : '';
          const key = normMedicineName(name);
          if (key && !names.has(key)) names.set(key, name);
        }
      }
      setKnownMedicines(names);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStep, knownMedicines]);

  const checkMedicineName = (name: string) => matchMedicineName(name, knownMedicines);

  // An extraction that has not been saved yet is work (and a paid model call)
  // that a stray tab close or Back press would throw away.
  const hasUnsavedScan = !!extractedData && !isSuccess;

  useEffect(() => {
    if (!hasUnsavedScan) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedScan]);

  // In-app navigation does not fire beforeunload, so the page's own links ask.
  const leaveScan = (path: string) => {
    if (
      hasUnsavedScan &&
      !window.confirm('This scan has not been saved. Leave and discard it?')
    ) {
      return;
    }
    router.push(asset(path));
  };

  // Blur/darkness check on page 1. Run on what will actually be sent -- the
  // enhanced image once the enhance panel closes, not the raw capture -- and
  // only as advice: a warning with a way to retake, never a block.
  const [mainQuality, setMainQuality] = useState<ImageQuality | null>(null);

  useEffect(() => {
    if (!preview || showDocProcessor) {
      setMainQuality(null);
      return;
    }
    let cancelled = false;
    void assessImageQuality(preview).then((quality) => {
      if (!cancelled) setMainQuality(quality);
    });
    return () => {
      cancelled = true;
    };
  }, [preview, showDocProcessor]);

  // Generate reference number when hospital is selected
  const handleHospitalChange = async (hospital: string) => {
    setSelectedHospital(hospital);
    // Step 1 can be revisited with an extraction kept, and the review and
    // success screens name the hospital from it.
    setExtractedData((prev) => (prev ? { ...prev, hospital_name: hospital } : prev));
    if (!hospital) {
      setReferenceNumber("");
      return;
    }
    try {
      setReferenceNumber(await generateReferenceNumber(hospital));
    } catch {
      // Only the preview. The number that gets stored is generated again at
      // save time, so a failure here is not worth interrupting the scan for --
      // and previously it threw out of an async event handler, which surfaced
      // as an unhandled rejection with nothing shown to the user at all.
      setReferenceNumber("");
    }
  };

  // Images only. A PDF could be selected before, but the extraction path could
  // never read one: preprocessImage() cannot decode a PDF, so it forwarded the
  // "data:application/pdf;base64," URL unchanged and the Edge Function's format
  // check rejected it outright. Every PDF prescription failed with "Invalid
  // image format" -- after the file had already been uploaded. Additional
  // documents still accept PDF; those are stored, not extracted.
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/jpg"];

  // Why an image can't be a prescription page, or null if it can.
  const imageFileError = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      const ext = file.name.split(".").pop()?.toUpperCase() || "Unknown";
      return `Unsupported file type: ${ext}. Please upload a JPG or PNG.`;
    }
    if (file.size > 10 * 1024 * 1024) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      return `File too large (${sizeMb} MB). Maximum size is 10 MB.`;
    }
    return null;
  };

  // A reading covers exactly the pages it was made from. Carrying it on after
  // the pages change would save a page nobody's reading came from.
  const invalidateReading = () => {
    if (!extractedData) return;
    setExtractedData(null);
    toast.info("The pages changed, so extract again to read them.");
  };

  const addExtraPage = (file: File) => {
    const error = imageFileError(file);
    if (extraPageInputRef.current) extraPageInputRef.current.value = "";
    if (error) {
      toast.error(error);
      return;
    }
    if (extraPages.length >= MAX_EXTRA_PAGES) {
      toast.error(`A prescription can have at most ${MAX_EXTRA_PAGES + 1} pages.`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("Could not read that page. Please try again.");
    reader.onloadend = () => {
      const page: ExtraPage = { id: crypto.randomUUID(), file, preview: reader.result as string };
      setExtraPages((prev) => (prev.length >= MAX_EXTRA_PAGES ? prev : [...prev, page]));
      invalidateReading();
      void assessImageQuality(page.preview).then((quality) =>
        setExtraPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, quality } : p))),
      );
    };
    reader.readAsDataURL(file);
  };

  const removeExtraPage = (id: string) => {
    setExtraPages((prev) => prev.filter((p) => p.id !== id));
    invalidateReading();
  };

  const handleFileSelect = (file: File) => {
    // Clear previous error
    setFileError(null);

    const error = imageFileError(file);
    if (error) {
      setFileError(error);
      toast.error(error);
      // Reset native input so the same file can be reselected after fixing
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
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
    setFileError(null);
    setShowDocProcessor(false);
    setRawPreview(null);
    // The later pages belong to the prescription being removed.
    setExtraPages([]);
    setReviewPage(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
    const slowTimer = setTimeout(() => setExtractSlow(true), 8000);

    try {
      // Extraction only -- nothing is written until the operator commits in
      // step 3. Uploading here is what left the bucket holding 14 unreferenced
      // files against a single saved record: every abandoned scan and every
      // retry after a failed extraction added one, and the bucket's
      // admin-only delete policy meant the scanner who made them could not
      // clear them. saveToDatabase() owns the upload now.
      // Every page, in order, read together as one prescription.
      const pages = await Promise.all(
        [selectedFile, ...extraPages.map((p) => p.file)].map(preprocessImage),
      );

      const { data, error } = await supabase.functions.invoke('extract-prescription', {
        body: { imagesBase64: pages },
      });

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
      setExtractionRaw((data.data ?? null) as Json | null);
      // A new reading is a new draft, and has to be confirmed from scratch.
      setDraftId(crypto.randomUUID());
      setVerifiedFields(new Set());
      setReviewPage(0);
      toast.success("Prescription data extracted successfully!");
      
      // Move to additional documents step
      setCurrentStep('additional-docs');
    } catch (error) {
      toast.error(describeError(error, 'Could not read that prescription. Please try again.'));
    } finally {
      clearTimeout(slowTimer);
      setExtractSlow(false);
      setIsProcessing(false);
    }
  };

  /**
   * Upload the attached documents, or fail the save.
   *
   * `uploadedPaths` is the caller's undo list and is appended to as each object
   * lands, so a failure part-way through can still take back the ones that did.
   *
   * This used to `continue` past a failed upload: the record then committed
   * without that document, and the success screen counted it as filed anyway.
   * A supporting document silently missing from a clinical record is the one
   * outcome this flow must not produce, so a failure now stops the save with
   * the file named and nothing written.
   */
  const uploadAdditionalDocs = async (
    uploadedPaths: string[],
  ): Promise<Array<{ name: string; url: string; type: string; docType: string }>> => {
    const uploadedDocs: Array<{ name: string; url: string; type: string; docType: string }> = [];
    // Pages 2..n of the prescription first, filed under the existing
    // "Additional Prescription" type so the record, the timeline and the PDF
    // export all show them without a schema change.
    const readyDocs: Array<{ file: File; docType: string; name: string }> = [
      ...extraPages.map((page, i) => ({
        file: page.file,
        docType: 'ADD_RX',
        name: `Prescription page ${i + 2}.${page.file.name.split('.').pop()}`,
      })),
      ...additionalDocs
        .filter((d) => d.status === "ready")
        .map((d) => ({ file: d.file, docType: d.docType as string, name: d.file.name })),
    ];

    for (const doc of readyDocs) {
      const fileExt = doc.file.name.split('.').pop();
      const fileName = `${user?.id}/additional/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('prescriptions')
        .upload(fileName, doc.file);
      
      if (error) {
        console.error(`Failed to upload ${doc.name}:`, error);
        throw new Error(
          `"${doc.name}" could not be uploaded, so nothing has been saved. Please try again.`,
        );
      }
      
      uploadedPaths.push(fileName);
      uploadedDocs.push({
        name: doc.name,
        url: fileName,
        type: doc.file.type.includes('pdf') ? 'PDF' : 'Image',
        docType: doc.docType,
      });
    }
    
    return uploadedDocs;
  };

  const removeMedicine = (id: string) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      medicines: extractedData.medicines.filter((m) => m._id !== id),
    });
    // One delete, because the key names the row. The version this replaces had
    // to regex every confirmation out of the set and shift the indices above
    // the deleted one down by hand.
    setVerifiedFields((prev) => {
      if (!prev.has(medicineKey(id))) return prev;
      const next = new Set(prev);
      next.delete(medicineKey(id));
      return next;
    });
  };

  // Undo the uploads a failed save made.
  //
  // This only started working when the "prescriptions: uploader deletes own
  // unreferenced" policy was added. The bucket's only delete policy was
  // admins-only, so for every ordinary scanner this call was refused and the
  // files stayed -- which is how 14 unreferenced objects accumulated against a
  // single saved record.
  const discardUploads = async (paths: string[]) => {
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from('prescriptions').remove(paths);
    if (error) {
      // Nothing more to do from here, and the save has its own message to
      // show. A sweeper for anything this misses is the follow-up.
      console.error('[cpms] could not discard uploads after a failed save:', error.name);
    }
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

    if (!selectedFile) {
      toast.error("The prescription image is missing. Please start the scan again.");
      return;
    }

    setIsProcessing(true);

    // Every object this save puts in the bucket, so a failure can take them
    // back out again. Nothing was written before this point.
    const uploadedPaths: string[] = [];

    // An earlier save of this same draft reached create_patient_record. That attempt
    // may well have committed -- a lost response looks exactly like a failure
    // from here.
    const isRetry = draftId !== null && attemptedDraftRef.current === draftId;

    try {
      // So ask, before uploading anything. create_patient_record() is
      // idempotent on _draft_id: it returns the existing row untouched, which
      // means a blind retry uploads a whole second set of files that the saved
      // record will never point at -- and once a record references its files,
      // no one but an admin can remove them.
      if (isRetry && draftId) {
        const { data: alreadySaved, error: lookupError } = await supabase
          .from('patient_records')
          .select('reference_number, additional_documents')
          .eq('draft_id', draftId)
          .maybeSingle();

        if (lookupError) {
          // Not fatal: saving the record matters more than the orphans a
          // duplicate upload would leave, and the check after the insert is a
          // second chance at those.
          console.error('[cpms] could not check for an existing draft:', lookupError.code);
        } else if (alreadySaved) {
          const stored = alreadySaved.additional_documents;
          setSavedDocCount(Array.isArray(stored) ? stored.length : 0);
          setReferenceNumber(alreadySaved.reference_number ?? '');
          setIsSuccess(true);
          toast.success('This record was already saved.');
          return;
        }
      }

      // The prescription image, which the extraction step used to upload long
      // before the operator had agreed to save anything.
      const fileExt = selectedFile.name.split('.').pop();
      const mainImagePath = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: mainUploadError } = await supabase.storage
        .from('prescriptions')
        .upload(mainImagePath, selectedFile);
      if (mainUploadError) throw mainUploadError;
      uploadedPaths.push(mainImagePath);

      // Upload additional documents if any
      let additionalDocsData: Array<{ name: string; url: string; type: string }> = [];
      if (additionalDocs.length > 0 || extraPages.length > 0) {
        setIsUploadingDocs(true);
        // Appends to uploadedPaths itself, so a throw part-way through still
        // leaves the undo list complete.
        additionalDocsData = await uploadAdditionalDocs(uploadedPaths);
        setIsUploadingDocs(false);
      }

      // One call allocates the reference number and inserts the row inside a
      // single transaction. The five-attempt retry loop this replaces existed
      // because the browser did those in two round trips, so the advisory lock
      // in generate_reference_number() was released before the insert arrived
      // and two scanners could read the same number. It is also the server, not
      // the client, that now decides permissions and stamps uploaded_by.
      const draft = draftId ?? crypto.randomUUID();
      if (!draftId) setDraftId(draft);
      // From here on a lost response could mean a committed record, so the
      // next press of Save for this draft must check before uploading.
      attemptedDraftRef.current = draft;

      const { data: created, error: insertError } = await supabase.rpc('create_patient_record', {
        _draft_id: draft,
        _patient_id: patientId.trim(),
        _patient_name: extractedData.patient_name.trim(),
        _hospital: selectedHospital,
        _uhid: extractedData.uhid ?? undefined,
        _age: extractedData.age != null ? Math.round(Number(extractedData.age)) : undefined,
        _gender: extractedData.gender ?? undefined,
        _height_cm: extractedData.height_cm ?? undefined,
        _weight_kg: extractedData.weight_kg ?? undefined,
        _bmi: calculateBMI(extractedData.height_cm, extractedData.weight_kg) ?? undefined,
        // The date the banner showed the operator, not null. The function
        // still defaults a null to current_date, but that is the *server's*
        // today -- a different day from the operator's for part of every day --
        // and the review step made them an exact promise about which one.
        _visit_date: extractedData.visit_date ?? visitDateFallback,
        _doctor_name: extractedData.doctor_name ?? undefined,
        _diagnosis: extractedData.diagnosis ?? undefined,
        // Without the `_id`s: they are a client-side handle for the
        // confirmation ticks. Storing them would both pollute the record and
        // make every medicines provenance comparison read as a correction.
        // `uncertain` is review guidance only; extraction_raw keeps it.
        _medicines: extractedData.medicines.map(
          ({ _id, uncertain: _uncertain, ...medicine }) => medicine,
        ) as unknown as Json,
        _additional_documents: additionalDocsData as unknown as Json,
        _prescription_image_url: mainImagePath,
        _confidence_score: extractedData.confidence_score ?? undefined,
        _extraction_raw: extractionRaw ?? undefined,
      });

      if (insertError) {
        // Nothing references these files, so take them back out. Pressing
        // Save again re-uploads the lot to fresh randomised paths, so leaving
        // them behind accumulates a full duplicate set per failed attempt with
        // no record pointing at any of it.
        await discardUploads(uploadedPaths);

        // create_patient_record() raises these two classes itself, with
        // wording written for this screen ("You are not assigned to this
        // hospital"), so they are safe to show as-is. Everything else goes
        // through describeError, which strips database detail.
        const code = (insertError as { code?: string }).code;
        if (code === '42501' || code === '22004') {
          toast.error(insertError.message);
        } else {
          toast.error(describeError(insertError, 'Could not save the patient record. Please try again.'));
        }
        return;
      }

      // The number the database actually stored, read back from the commit --
      // never a locally generated guess.
      const createdRow = Array.isArray(created) ? created[0] : created;

      // The pre-flight check above cannot see a row that committed while this
      // attempt was in the air. If what came back is a record pointing at some
      // earlier attempt's image, everything this attempt uploaded belongs to
      // nothing -- and unlike the referenced files, it can still be removed.
      let savedCount = additionalDocsData.length;
      if (isRetry && createdRow?.created_id) {
        const { data: storedRow } = await supabase
          .from('patient_records')
          .select('prescription_image_url, additional_documents')
          .eq('id', createdRow.created_id)
          .maybeSingle();
        if (storedRow && storedRow.prescription_image_url !== mainImagePath) {
          await discardUploads(uploadedPaths);
          // The record that exists is the earlier attempt's, so count its
          // documents, not the ones just thrown away.
          const stored = storedRow.additional_documents;
          savedCount = Array.isArray(stored) ? stored.length : 0;
        }
      }

      setSavedDocCount(savedCount);
      setReferenceNumber(createdRow?.created_reference_number ?? '');
      setIsSuccess(true);
      toast.success("Patient data saved successfully!");
    } catch (error) {
      await discardUploads(uploadedPaths);
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
    setVerifiedFields(new Set());
    setDraftId(null);
    attemptedDraftRef.current = null;
    setSavedDocCount(0);
    setExtractionRaw(null);
    setAdditionalDocs([]);
    setExtraPages([]);
    setReviewPage(0);
    setCurrentStep('upload');
    setShowDocProcessor(false);
    setRawPreview(null);
  };

  // The model's own list of values it could not read with certainty. Each one
  // stays highlighted, and on the "still to confirm" list, until the operator
  // edits it or presses its Confirm -- the same rule the patient name follows.
  const isUnclear = (field: string) => !!extractedData?.uncertainFields.includes(field);
  const needsLook = (field: string) => isUnclear(field) && !verifiedFields.has(fieldKey(field));
  const unclearClass = (field: string) => (needsLook(field) ? UNCLEAR_INPUT : '');

  const editField = (field: string, patch: Partial<ExtractedData>) => {
    setExtractedData((prev) => (prev ? { ...prev, ...patch } : prev));
    markVerified(fieldKey(field));
  };

  // Called, not rendered as <FieldLabel/>: a component declared in the render
  // body would remount on every change and drop focus (see VerifyCheck).
  const fieldLabel = (field: string, htmlFor: string, text: string) => (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor}>
        {text}
        {isUnclear(field) && <UnclearNote />}
      </Label>
      {isUnclear(field) && (
        <VerifyCheck
          done={verifiedFields.has(fieldKey(field))}
          onToggle={() => toggleVerified(fieldKey(field))}
        />
      )}
    </div>
  );

  // What still has to be confirmed before this record can be saved.
  const outstandingChecks: string[] = extractedData
    ? [
        ...(patientId.trim() ? [] : ['a Patient ID']),
        ...(verifiedFields.has('patient_name') ? [] : ['the patient name']),
        ...Object.keys(UNCLEAR_FIELD_LABELS)
          .filter(needsLook)
          .map((field) => `the ${UNCLEAR_FIELD_LABELS[field]} (unclear on the page)`),
        ...(extractedData.medicines.length === 0
          ? verifiedFields.has('medicines_none')
            ? []
            : ['that this prescription lists no medicines']
          : extractedData.medicines
              .map((med, i) => ({ med, i }))
              // A row with no name is outstanding whatever its tick says.
              // Mis-clicking Add Medicine leaves a blank row whose most
              // obvious dismissal is its own Confirm button, and that used to
              // be enough to write `{name:'',dosage:'',...}` into the record.
              .filter(({ med }) => !verifiedFields.has(medicineKey(med._id)) || med.name.trim() === '')
              .map(({ med, i }) =>
                med.name.trim() === '' ? `a name for medicine ${i + 1}` : `medicine ${i + 1}`,
              )),
      ]
    : [];

  const readyToSave =
    !!extractedData &&
    patientId.trim() !== '' &&
    extractedData.patient_name.trim() !== '' &&
    outstandingChecks.length === 0;

  // Saving stamps today when the scan carried no date. The record should not
  // acquire a visit date nobody chose without the operator having seen it.
  //
  // Built from local date parts, and sent explicitly rather than left to the
  // function's `coalesce(_visit_date, current_date)`. Two separate ways the old
  // one-liner could promise a day the record did not get: `toISOString()` is
  // the UTC day, which is not the database server's day for several hours
  // daily, and `new Date('YYYY-MM-DD')` parses as UTC midnight, so rendering it
  // showed the day before for any viewer west of UTC.
  const visitDateFallbackDate = new Date();
  const visitDateFallback = localToday();

  // Patient ID and uhid are two readings of the same hospital UHID: the one the
  // operator types and the one the model reads off the page. When they disagree
  // one of them is wrong, and nothing used to say so.
  const extractedUhid = extractedData?.uhid?.trim() || '';
  const uhidMismatch = extractedUhid !== '' && extractedUhid !== patientId.trim();

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

  // Refused here rather than at the last step. can_scan is enforced by the
  // Edge Function, by the bucket's insert policy and by patient_records' insert
  // policy, but ProtectedRoute only checks that the account is enabled and has
  // finished onboarding -- so without this an account without the permission
  // could fill in the whole of step 1 and the first thing to refuse it would be
  // the upload at save time.
  if (!roleLoading && !canScan) {
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
              <span className="font-bold text-xl tracking-tight">Scan Prescription</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 flex items-center justify-center">
          <Card className="max-w-lg w-full border-2">
            <CardContent className="p-8 text-center space-y-4">
              <div className="h-16 w-16 bg-secondary mx-auto flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-bold">Scanning isn&apos;t enabled for your account</h2>
              <p className="text-sm text-muted-foreground">
                Prescription scanning needs the scan permission. Ask an administrator to grant it,
                then reload this page.
              </p>
              <Button onClick={() => router.push(asset("/dashboard"))} className="w-full">
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

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
                {savedDocCount > 0 && (
                  <p className="text-sm">
                    <span className="font-semibold">Additional Documents:</span> {savedDocCount} filed
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
          <Button variant="ghost" size="icon" onClick={() => leaveScan("/dashboard")}>
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
        <div className={`${currentStep === 'review' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto space-y-6`}>
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
                      accept="image/jpeg,image/png,image/jpg"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    <Upload className={`h-12 w-12 mx-auto mb-4 ${fileError ? "text-destructive" : "text-muted-foreground"}`} />
                    <p className="font-medium mb-2">Drag & drop your prescription here</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Supports JPG, PNG (max 10MB)
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
                          setCameraTarget('main');
                          setIsCameraOpen(true);
                        }}
                      >
                        <Camera className="h-4 w-4" />
                        Take Photo
                      </Button>
                    </div>
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

                    {/* Nothing under the enhance panel while it is open: the
                        placeholder branch used to render there, showing
                        "Preview unavailable" and a stray delete button. */}
                    {showDocProcessor ? null : preview ? (
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
                        <p className="text-sm text-muted-foreground">Preview unavailable</p>
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

                    {/* Later pages of the same prescription */}
                    {!showDocProcessor && (
                      <div className="space-y-2 border-2 border-dashed border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            More pages{" "}
                            <span className="text-muted-foreground font-normal">
                              ({extraPages.length + 1} of {MAX_EXTRA_PAGES + 1})
                            </span>
                          </p>
                          {extraPages.length < MAX_EXTRA_PAGES && (
                            <div className="flex gap-2">
                              <input
                                ref={extraPageInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/jpg"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && addExtraPage(e.target.files[0])}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => extraPageInputRef.current?.click()}
                              >
                                <Plus className="h-4 w-4" />
                                Add page
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => {
                                  setCameraTarget('page');
                                  setIsCameraOpen(true);
                                }}
                              >
                                <Camera className="h-4 w-4" />
                                Photo
                              </Button>
                            </div>
                          )}
                        </div>
                        {extraPages.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            If the prescription continues on another page, add it here so every
                            medicine is read together.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {extraPages.map((page, i) => (
                              <div key={page.id} className="relative h-24 w-20 border border-border bg-secondary">
                                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                                <img
                                  src={page.preview}
                                  alt={`Prescription page ${i + 2}`}
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-[11px] text-center">
                                  Page {i + 2}
                                </span>
                                {/* The page's own quality flag; the full sentence is its tooltip. */}
                                {qualityWarning(page.quality ?? null) && (
                                  <span
                                    className="absolute top-0 left-0 bg-yellow-500 text-[10px] font-semibold px-1"
                                    title={qualityWarning(page.quality ?? null) ?? undefined}
                                  >
                                    {page.quality?.dark ? "Dark" : "Blurry"}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeExtraPage(page.id)}
                                  aria-label={`Remove page ${i + 2}`}
                                  className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center bg-destructive text-destructive-foreground rounded-full"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Photo quality advice for page 1 */}
                {selectedFile && !showDocProcessor && qualityWarning(mainQuality) && (
                  <div role="status" className="flex items-start gap-3 p-3 border-2 border-yellow-600 bg-yellow-500/10">
                    <AlertTriangle className="h-5 w-5 text-yellow-700 shrink-0 mt-0.5" />
                    <p className="text-sm flex-1 min-w-0">{qualityWarning(mainQuality)}</p>
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={clearFile}>
                      Retake
                    </Button>
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
                        Allowed: JPG, PNG · Max 10 MB
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
                      {permittedHospitals.map((hospital) => (
                        <SelectItem key={hospital.value} value={hospital.value}>
                          {hospital.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* `!roleLoading`: assignedHospitals starts empty and the
                      master short-circuit in canAccessHospital needs a role
                      that has not arrived yet, so without this the warning
                      below flashed on every load, for every user. */}
                  {!roleLoading && permittedHospitals.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      You aren&apos;t assigned to any hospital yet, so there is nowhere to file this
                      record. Ask an administrator to assign you one.
                    </p>
                  )}
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
                          leaveScan(`/patients/timeline/${encodeURIComponent(selectedHospital)}/${encodeURIComponent(patientId.trim())}`)
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

                {/* Back here from step 2 with a reading already in hand:
                    carry on with it, or read the image again. Removing the
                    image clears the reading, so it can't outlive its image. */}
                {extractedData && (
                  <div className="space-y-2">
                    <Button
                      className="w-full h-12"
                      disabled={!selectedHospital || !patientId.trim() || isProcessing}
                      onClick={() => setCurrentStep('additional-docs')}
                    >
                      Continue with this reading
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Extracting again replaces the current reading and any edits to it.
                    </p>
                  </div>
                )}

                {/* Process Button */}
                <Button
                  className="w-full h-12"
                  variant={extractedData ? "outline" : "default"}
                  disabled={!selectedFile || !selectedHospital || !patientId.trim() || isProcessing}
                  onClick={processWithAI}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {extractSlow ? "Google's AI is busy, still trying…" : "Extracting with OCR..."}
                    </>
                  ) : extractedData ? (
                    "Extract again"
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
                    className="gap-2"
                    onClick={() => setCurrentStep('upload')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
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
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              {/* The prescription itself. This step asked the operator to
                  confirm extracted values against a page they could no longer
                  see -- the one thing a review step has to show. */}
              <Card className="border-2 lg:sticky lg:top-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    The prescription
                  </CardTitle>
                  <CardDescription>
                    Check each field against this image. Pinch, scroll or use the buttons to zoom.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {extraPages.length > 0 && (
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Prescription pages">
                      {[preview, ...extraPages.map((p) => p.preview)].map((_, i) => (
                        <Button
                          key={i}
                          type="button"
                          size="sm"
                          variant={reviewPage === i ? "default" : "outline"}
                          aria-pressed={reviewPage === i}
                          onClick={() => setReviewPage(i)}
                        >
                          Page {i + 1}
                        </Button>
                      ))}
                      <p className="w-full text-xs text-muted-foreground">
                        Pages after the first are saved with the record as &ldquo;Additional
                        Prescription&rdquo; documents.
                      </p>
                    </div>
                  )}
                  {preview ? (
                    <ImagePreviewViewer
                      // Keyed so switching pages starts the new one unzoomed.
                      key={reviewPage}
                      src={reviewPage === 0 ? preview : extraPages[reviewPage - 1]?.preview ?? preview}
                      alt={`Prescription page ${reviewPage + 1} being reviewed`}
                      className="w-full h-[360px] lg:h-[560px]"
                    />
                  ) : (
                    <div className="w-full h-[360px] border-2 border-border bg-secondary flex flex-col items-center justify-center gap-2">
                      <FileText className="h-12 w-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Preview unavailable</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={`border-2 ${readyToSave ? 'border-primary' : 'border-yellow-500'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-accent-foreground" />
                  Step 3: Review & Edit
                </CardTitle>
                <CardDescription>
                  Correct anything the scan misread, then confirm the patient name and every
                  medicine before saving.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                    {/* Anything the save would decide on its own, said out loud
                        before it happens rather than discovered afterwards. */}
                    {(!extractedData.visit_date || uhidMismatch || sameDayRecord) && (
                      <div className="space-y-2">
                        {sameDayRecord && (
                          <div role="alert" className="flex items-start gap-2 p-3 border-2 border-yellow-600 bg-yellow-500/10">
                            <AlertTriangle className="h-4 w-4 text-yellow-700 shrink-0 mt-0.5" />
                            <p className="text-sm flex-1 min-w-0">
                              Patient <span className="font-mono font-medium">{patientId.trim()}</span>{' '}
                              already has a record for this visit date at {selectedHospital}
                              {sameDayRecord.reference_number ? (
                                <> (<span className="font-mono font-medium">{sameDayRecord.reference_number}</span>)</>
                              ) : null}
                              . Make sure this prescription hasn&apos;t already been scanned.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() =>
                                window.open(
                                  asset(`/patients/timeline/${encodeURIComponent(selectedHospital)}/${encodeURIComponent(patientId.trim())}`),
                                  '_blank',
                                  'noopener',
                                )
                              }
                            >
                              View history
                            </Button>
                          </div>
                        )}
                        {!extractedData.visit_date && (
                          <div role="alert" className="flex items-start gap-2 p-3 border-2 border-yellow-600 bg-yellow-500/10">
                            <AlertTriangle className="h-4 w-4 text-yellow-700 shrink-0 mt-0.5" />
                            <p className="text-sm">
                              No visit date was read from this prescription. Saving now records{' '}
                              <span className="font-medium">
                                {visitDateFallbackDate.toLocaleDateString()}
                              </span>
                              . Set the correct date below if you know it.
                            </p>
                          </div>
                        )}
                        {uhidMismatch && (
                          <div role="alert" className="flex items-start gap-2 p-3 border-2 border-yellow-600 bg-yellow-500/10">
                            <AlertTriangle className="h-4 w-4 text-yellow-700 shrink-0 mt-0.5" />
                            <p className="text-sm flex-1 min-w-0">
                              The scan reads UHID{' '}
                              <span className="font-mono font-medium">{extractedUhid}</span>, which
                              is not the Patient ID you entered (
                              <span className="font-mono font-medium">{patientId.trim()}</span>).
                              Check you are filing against the right patient.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => setPatientId(extractedUhid)}
                            >
                              Use scanned UHID
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-patient-id">Patient ID *</Label>
                        {/* Editable here: there is no way back to step 1 without
                            losing the extraction, and the UHID warning above
                            asks the operator to fix exactly this field. */}
                        <Input
                          id="edit-patient-id"
                          value={patientId}
                          onChange={(e) => setPatientId(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="edit-patient-name">
                            Patient Name *{isUnclear('patient_name') && <UnclearNote />}
                          </Label>
                          <VerifyCheck
                            done={verifiedFields.has('patient_name')}
                            onToggle={() => toggleVerified('patient_name')}
                          />
                        </div>
                        <Input
                          id="edit-patient-name"
                          value={extractedData.patient_name}
                          className={isUnclear('patient_name') && !verifiedFields.has('patient_name') ? UNCLEAR_INPUT : ''}
                          onChange={(e) => {
                            setExtractedData({...extractedData, patient_name: e.target.value});
                            markVerified('patient_name');
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        {fieldLabel('age', 'edit-age', 'Age')}
                        <Input 
                          id="edit-age" 
                          type="number"
                          value={extractedData.age ?? ''}
                          className={unclearClass('age')}
                          onChange={(e) => editField('age', { age: e.target.value ? parseInt(e.target.value) : null })}
                        />
                      </div>
                      <div className="space-y-2">
                        {fieldLabel('gender', 'edit-gender', 'Gender')}
                        <Select value={extractedData.gender || ''} onValueChange={(val) => editField('gender', { gender: val })}>
                          <SelectTrigger id="edit-gender" className={unclearClass('gender')}>
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
                        {fieldLabel('height_cm', 'edit-height', 'Height (cm)')}
                        <Input 
                          id="edit-height" 
                          type="number"
                          value={extractedData.height_cm || ''} 
                          className={unclearClass('height_cm')}
                          onChange={(e) => editField('height_cm', { height_cm: e.target.value ? parseFloat(e.target.value) : null })}
                        />
                      </div>
                      <div className="space-y-2">
                        {fieldLabel('weight_kg', 'edit-weight', 'Weight (kg)')}
                        <Input 
                          id="edit-weight" 
                          type="number"
                          value={extractedData.weight_kg || ''} 
                          className={unclearClass('weight_kg')}
                          onChange={(e) => editField('weight_kg', { weight_kg: e.target.value ? parseFloat(e.target.value) : null })}
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
                        {fieldLabel('doctor_name', 'edit-doctor', 'Doctor Name')}
                        <Input 
                          id="edit-doctor" 
                          value={extractedData.doctor_name || ''} 
                          className={unclearClass('doctor_name')}
                          onChange={(e) => editField('doctor_name', { doctor_name: e.target.value || null })}
                        />
                      </div>
                      <div className="space-y-2">
                        {fieldLabel('visit_date', 'edit-visit-date', 'Visit Date')}
                        <Input 
                          id="edit-visit-date" 
                          type="date"
                          value={extractedData.visit_date || ''}
                          max={visitDateFallback}
                          className={unclearClass('visit_date')}
                          onChange={(e) => editField('visit_date', { visit_date: e.target.value || null })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Model self-report</Label>
                        <div className="flex items-center gap-2 h-10">
                          <span className="font-medium text-muted-foreground">
                            {extractedData.confidence_score ?? 0}%
                          </span>
                        </div>
                        {/* Deliberately not colour-coded, and no longer a gate.
                            The prompt instructs the model to score generously
                            and to stay at or above 70 whenever it read a name
                            and one medicine, so a high number here says nothing
                            about whether the reading is right. The confirmations
                            are the check that does. */}
                        <p className="text-xs text-muted-foreground">
                          The model&apos;s own estimate. Not a reliability measure &mdash; confirm the
                          fields against the image regardless.
                        </p>
                      </div>
                      <div className="sm:col-span-2 space-y-2">
                        {fieldLabel('diagnosis', 'edit-diagnosis', 'Diagnosis')}
                        <Textarea
                          id="edit-diagnosis"
                          value={extractedData.diagnosis || ''}
                          className={unclearClass('diagnosis')}
                          onChange={(e) => editField('diagnosis', { diagnosis: e.target.value || null })}
                          rows={2}
                        />
                      </div>
                    </div>

                    {/* Editable Medicines */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Medicines</Label>
                        {/* Typing suggestions for every name input below. */}
                        <datalist id="known-medicine-names">
                          {knownMedicines &&
                            [...knownMedicines.values()].map((name) => <option key={name} value={name} />)}
                        </datalist>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setExtractedData({
                            ...extractedData,
                            medicines: [
                              ...(extractedData.medicines || []),
                              { _id: crypto.randomUUID(), name: '', dosage: '', frequency: '', duration: '', uncertain: [] },
                            ]
                          })}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add Medicine
                        </Button>
                      </div>
                      {extractedData.medicines && extractedData.medicines.length > 0 ? (
                        extractedData.medicines.map((med, index) => {
                          // Editing any part of a row counts as having checked
                          // it -- you cannot retype a dose without reading it.
                          const setField = (
                            field: 'name' | 'dosage' | 'frequency' | 'duration',
                            value: string,
                          ) => {
                            const newMeds = [...extractedData.medicines];
                            newMeds[index] = { ...newMeds[index], [field]: value };
                            setExtractedData({ ...extractedData, medicines: newMeds });
                            markVerified(medicineKey(med._id));
                          };
                          const checked = verifiedFields.has(medicineKey(med._id));
                          // What the model was unsure of in this row stays
                          // highlighted until the row is confirmed.
                          const unclearPart = (part: string) =>
                            !checked && med.uncertain.includes(part) ? UNCLEAR_INPUT : '';
                          const nameCheck = checkMedicineName(med.name);
                          return (
                            <div
                              key={med._id}
                              className={`p-3 bg-secondary border space-y-2 ${
                                checked ? 'border-border' : 'border-yellow-600'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  Medicine {index + 1}
                                  {med.uncertain.length > 0 && (
                                    <span className="ml-2 normal-case tracking-normal font-medium text-yellow-700">
                                      Unclear: {med.uncertain.map((p) => MEDICINE_PART_LABELS[p] ?? p).join(', ')}
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-1">
                                  <VerifyCheck
                                    done={checked}
                                    onToggle={() => toggleVerified(medicineKey(med._id))}
                                    label="Confirm dose"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => removeMedicine(med._id)}
                                    aria-label={`Remove medicine ${index + 1}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="col-span-2 space-y-1">
                                  <Input
                                    placeholder="Medicine name"
                                    value={med.name}
                                    list="known-medicine-names"
                                    onChange={(e) => setField('name', e.target.value)}
                                    className={unclearPart('name')}
                                  />
                                  {nameCheck.suggestion ? (
                                    <p className="text-xs text-yellow-700 flex flex-wrap items-center gap-1">
                                      Not in earlier records. Did you mean{' '}
                                      <span className="font-medium">{nameCheck.suggestion}</span>?
                                      <button
                                        type="button"
                                        className="underline font-medium"
                                        onClick={() => setField('name', nameCheck.suggestion!)}
                                      >
                                        Use it
                                      </button>
                                    </p>
                                  ) : nameCheck.unseen ? (
                                    <p className="text-xs text-yellow-700">
                                      Not in earlier records &mdash; check the spelling against the image.
                                    </p>
                                  ) : null}
                                </div>
                                <Input
                                  placeholder="Dosage"
                                  value={med.dosage}
                                  onChange={(e) => setField('dosage', e.target.value)}
                                  className={unclearPart('dosage')}
                                />
                                <Input
                                  placeholder="Frequency"
                                  value={med.frequency}
                                  onChange={(e) => setField('frequency', e.target.value)}
                                  className={unclearPart('frequency')}
                                />
                                <Input
                                  placeholder="Duration"
                                  value={med.duration}
                                  onChange={(e) => setField('duration', e.target.value)}
                                  className={`col-span-2 ${unclearPart('duration')}`}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        // An empty list is a claim about the prescription, not
                        // an absence of data, so it needs confirming too --
                        // otherwise a failed read of the medicine block saves
                        // as a prescription with no medicines on it.
                        <div className="p-3 bg-secondary border-2 border-yellow-600 space-y-2">
                          <p className="text-sm">The scan found no medicines on this prescription.</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <VerifyCheck
                              done={verifiedFields.has('medicines_none')}
                              onToggle={() => toggleVerified('medicines_none')}
                              label="Confirm there are none"
                            />
                            <span className="text-xs text-muted-foreground">
                              or add them with &ldquo;Add Medicine&rdquo; above.
                            </span>
                          </div>
                        </div>
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

                {/* Still to confirm */}
                {outstandingChecks.length > 0 && (
                  <div className="flex items-start gap-2 p-3 border-2 border-yellow-600 bg-yellow-500/10">
                    <AlertTriangle className="h-4 w-4 text-yellow-700 shrink-0 mt-0.5" />
                    <p className="text-sm">
                      Confirm against the image before saving:{' '}
                      <span className="font-medium">{outstandingChecks.join(', ')}</span>.
                    </p>
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
                    disabled={isProcessing || !readyToSave}
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
            </div>
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Button - Step 1 */}
      {currentStep === 'upload' && !extractedData && selectedFile && selectedHospital && patientId.trim() && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-card border-t-2 border-border safe-area-pb">
          <Button
            className="w-full h-14 text-base"
            disabled={isProcessing}
            onClick={processWithAI}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {extractSlow ? "AI busy, still trying…" : "Extracting..."}
              </>
            ) : (
              "Extract Data with AI"
            )}
          </Button>
        </div>
      )}

      <DocumentCamera
        open={isCameraOpen}
        title={cameraTarget === 'page' ? `Take Photo · Page ${extraPages.length + 2}` : "Take Photo · Prescription"}
        hint="Line the prescription up inside the dashed guide."
        fileName={() => `prescription-${Date.now()}.jpg`}
        onCapture={(file) => {
          if (cameraTarget === 'page') {
            addExtraPage(file);
            toast.success(`Page ${extraPages.length + 2} added`);
          } else {
            handleFileSelect(file);
            toast.success("Photo captured successfully!");
          }
        }}
        onClose={() => setIsCameraOpen(false)}
      />

      {/* Spacer for mobile fixed button */}
      {currentStep === 'upload' && !extractedData && selectedFile && selectedHospital && patientId.trim() && (
        <div className="lg:hidden h-24" />
      )}
    </div>
  );
};

export default ScanPrescription;

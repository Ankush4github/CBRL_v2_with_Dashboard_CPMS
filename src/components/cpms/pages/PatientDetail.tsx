"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/cpms/ui/alert-dialog";
import {
  Activity,
  ArrowLeft,
  Download,
  User,
  FileDown,
  Loader2,
  FileText,
  Image as ImageIcon,
  Eye,
  Calendar,
  Stethoscope,
  Building2,
  Pill,
  File,
  Trash2,
  Pencil,
  History,
  Check,
  X,
} from "lucide-react";
import { Textarea } from "@/components/cpms/ui/textarea";
import { Input } from "@/components/cpms/ui/input";
import { Label } from "@/components/cpms/ui/label";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { useToast } from "@/hooks/cpms/use-toast";
import { describeError } from "@/lib/cpms/errors";
import { useRole } from "@/hooks/cpms/useRole";
import DocumentPreviewModal from "@/components/cpms/DocumentPreviewModal";
import { asset } from "@/lib/cpms/base-path";

interface AdditionalDocument {
  name: string;
  url: string;
  type: string;
}

interface PatientRecord {
  id: string;
  patient_id: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  diagnosis: string | null;
  medicines: any;
  visit_date: string | null;
  doctor_name: string | null;
  hospital: string;
  prescription_image_url: string | null;
  additional_documents: AdditionalDocument[] | null;
  created_at: string | null;
  reference_number: string | null;
}

interface PreviewState {
  isOpen: boolean;
  url: string | null;
  name: string;
  filePath: string;
  // Kept alongside the object URL so the viewer's Download button can save the
  // bytes already on the client instead of fetching them a second time.
  blob: Blob | null;
}

interface AuditLogEntry {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
  changer_name?: string;
}

const PatientDetail = () => {
  const router = useRouter();
  // Next's useParams() types values as string | string[] because a catch-all
  // segment can yield an array. [id] is a single segment, so narrow it here
  // rather than casting at every use site.
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { toast } = useToast();
  const { isMaster, isAdmin } = useRole();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  // A delete is permanent (the record, its history, and after a week its files
  // via sweep-orphan-uploads), so the master types the word, not just clicks.
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const deleteConfirmed = deleteConfirmText === "DELETE";
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    isOpen: false,
    url: null,
    name: "",
    filePath: "",
    blob: null,
  });
  // The object URL currently handed to the preview. Mirrored in a ref so it can
  // be revoked from cleanup without depending on render timing.
  const previewUrlRef = useRef<string | null>(null);
  const [isEditingDiagnosis, setIsEditingDiagnosis] = useState(false);
  const [editedDiagnosis, setEditedDiagnosis] = useState("");
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const handleDelete = async () => {
    if (!patient || !deleteConfirmed) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("patient_records")
        .delete()
        .eq("id", patient.id);

      if (error) throw error;

      toast({
        title: "Record deleted",
        description: `Patient record for ${patient.patient_name} has been deleted.`,
      });
      router.push(asset("/patients"));
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: describeError(error, 'Could not delete this record. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const fetchPatient = async () => {
      if (!id) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("patient_records")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        
        if (!data) {
          toast({
            title: "Patient not found",
            description: "The requested patient record does not exist.",
            variant: "destructive",
          });
          router.push(asset("/patients"));
          return;
        }
        
        // Parse additional_documents from JSON
        let additionalDocs: AdditionalDocument[] | null = null;
        if (data.additional_documents && Array.isArray(data.additional_documents)) {
          additionalDocs = (data.additional_documents as any[]).map((doc: any) => ({
            name: doc.name || "",
            url: doc.url || "",
            type: doc.type || "File",
          }));
        }
        
        const parsedData: PatientRecord = {
          id: data.id,
          patient_id: data.patient_id,
          patient_name: data.patient_name,
          age: data.age,
          gender: data.gender,
          diagnosis: data.diagnosis,
          medicines: data.medicines,
          visit_date: data.visit_date,
          doctor_name: data.doctor_name,
          hospital: data.hospital,
          prescription_image_url: data.prescription_image_url,
          additional_documents: additionalDocs,
          created_at: data.created_at,
          reference_number: data.reference_number,
        };
        
        setPatient(parsedData);
      } catch (error: any) {
        toast({
          title: "Error fetching patient",
          description: describeError(error, 'Could not load this patient record.'),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPatient();
  }, [id]);

  // Revoke the last object URL on unmount, so navigating away from a patient
  // does not leave the document's bytes pinned in memory.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const releasePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  // Saving is shared: the list's download button and the viewer's both end up
  // writing a blob we already hold.
  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDocument = async (filePath: string, fileName: string) => {
    setDownloadingDoc(filePath);
    try {
      const { data, error } = await supabase.storage
        .from("prescriptions")
        .download(filePath);

      if (error) throw error;

      saveBlob(data, fileName);

      toast({
        title: "Download started",
        description: `Downloading ${fileName}`,
      });
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: describeError(error, 'Could not download that file. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setDownloadingDoc(null);
    }
  };

  // Documents are downloaded and shown as object URLs rather than linked
  // directly. CPMS's CSP allows blob: but deliberately does not list the
  // Supabase origin in img-src, and has no frame-src for it, so putting a signed
  // URL in an <img> or <iframe> is blocked outright - which is what made every
  // preview come up blank while the download button still worked. Going through
  // the blob also keeps the signed URL out of the DOM and saves the viewer's
  // Download button a second trip to storage.
  const openPreview = async (filePath: string, fileName: string) => {
    releasePreviewUrl();

    // Open immediately so the click has visible feedback while bytes arrive,
    // instead of appearing to do nothing until the download finishes.
    setPreview({ isOpen: true, url: null, name: fileName, filePath, blob: null });

    try {
      const { data, error } = await supabase.storage
        .from("prescriptions")
        .download(filePath);

      if (error) throw error;

      const objectUrl = URL.createObjectURL(data);
      previewUrlRef.current = objectUrl;

      setPreview({
        isOpen: true,
        url: objectUrl,
        name: fileName,
        filePath: filePath,
        blob: data,
      });
    } catch (error: any) {
      setPreview({ isOpen: false, url: null, name: "", filePath: "", blob: null });
      toast({
        title: "Failed to open document",
        description: describeError(error, 'Could not open that document. Please try again.'),
        variant: "destructive",
      });
    }
  };

  const closePreview = () => {
    releasePreviewUrl();
    setPreview({
      isOpen: false,
      url: null,
      name: "",
      filePath: "",
      blob: null,
    });
  };

  const downloadPreviewDoc = () => {
    if (!preview.name) return;

    // The preview already holds the bytes, so this is a local save.
    if (preview.blob) {
      saveBlob(preview.blob, preview.name);
      toast({
        title: "Download started",
        description: `Downloading ${preview.name}`,
      });
      return;
    }

    if (preview.filePath) {
      downloadDocument(preview.filePath, preview.name);
    }
  };

  const downloadMergedPdf = async () => {
    if (!patient) return;
    
    setGeneratingPdf(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast({
          title: "Authentication required",
          description: "Please log in to download the PDF.",
          variant: "destructive",
        });
        return;
      }

      const response = await supabase.functions.invoke("generate-patient-pdf", {
        body: { patientId: patient.id },
      });

      if (response.error) {
        // Not `response.error.message` — supabase-js reports every non-2xx as
        // "Edge Function returned a non-2xx status code", which tells the user
        // nothing and names the architecture. The function's own message is in
        // the wrapped response body, which describeError does not read, so the
        // fallback below is what shows.
        throw response.error;
      }

      // The response.data is already a Blob when content-type is application/pdf
      const blob = response.data instanceof Blob 
        ? response.data 
        : new Blob([response.data], { type: "application/pdf" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patient.patient_name.replace(/\s+/g, "_")}_${patient.reference_number || patient.patient_id}_record.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded",
        description: "Patient record PDF has been downloaded successfully.",
      });
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({
        title: "PDF generation failed",
        description: describeError(error, "Failed to generate PDF. Please try again."),
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatMedicines = (
    medicines: any,
  ): Array<{ name: string; dosage: string; frequency: string; duration: string }> => {
    if (!medicines) return [];
    if (Array.isArray(medicines)) {
      return medicines.map((m: any) => {
        if (typeof m === "string") {
          return { name: m, dosage: "", frequency: "", duration: "" };
        }
        // Frequency is saved by every scan ("1-0-1", "twice daily") and was
        // dropped here, leaving the one instruction that says how often to take
        // a medicine off the record page.
        return {
          name: m.name || "",
          dosage: m.dosage || "",
          frequency: m.frequency || "",
          duration: m.duration || "",
        };
      });
    }
    return [];
  };

  const startEditingDiagnosis = () => {
    setEditedDiagnosis(patient?.diagnosis || "");
    setIsEditingDiagnosis(true);
  };

  const cancelEditingDiagnosis = () => {
    setIsEditingDiagnosis(false);
    setEditedDiagnosis("");
  };

  const saveDiagnosis = async () => {
    if (!patient) return;
    
    const oldValue = patient.diagnosis;
    const newValue = editedDiagnosis.trim() || null;
    
    // Don't save if nothing changed
    if (oldValue === newValue) {
      setIsEditingDiagnosis(false);
      return;
    }
    
    setSavingDiagnosis(true);
    try {
      // Conditional on the value this screen loaded, and asking for the row
      // back. An UPDATE that RLS filters out, or that finds the record gone,
      // returns no error -- it just matches nothing -- so without the row
      // count the toast said "saved" for a write that never happened. The
      // condition also stops a save silently overwriting a colleague's edit
      // made since this page loaded.
      let update = supabase
        .from("patient_records")
        .update({ diagnosis: newValue })
        .eq("id", patient.id);
      update = oldValue === null ? update.is("diagnosis", null) : update.eq("diagnosis", oldValue);
      const { data: updated, error } = await update.select("id");

      if (error) throw error;

      if (!updated || updated.length === 0) {
        toast({
          title: "Diagnosis not saved",
          description:
            "This record changed since you opened it, or you no longer have access to it. Reload the page to see the current version.",
          variant: "destructive",
        });
        return;
      }

      // The audit entry is written by the patient_records_audit trigger, which
      // records every changed column and cannot be bypassed by the client.
      setPatient({ ...patient, diagnosis: newValue });
      setIsEditingDiagnosis(false);
      
      // Refresh audit logs
      fetchAuditLogs(patient.id);
      
      toast({
        title: "Diagnosis updated",
        description: "The diagnosis has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to update diagnosis",
        description: describeError(error, 'Could not save the diagnosis. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setSavingDiagnosis(false);
    }
  };

  const fetchAuditLogs = async (recordId: string) => {
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase
        .from("patient_record_audit")
        .select("*")
        .eq("patient_record_id", recordId)
        .order("changed_at", { ascending: false });

      if (error) throw error;

      // Fetch profile names for changers
      const logsWithNames: AuditLogEntry[] = await Promise.all(
        (data || []).map(async (log) => {
          let changerName = "Unknown User";
          if (log.changed_by) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", log.changed_by)
              .maybeSingle();
            changerName = profile?.full_name || profile?.email || "Unknown User";
          }
          return {
            ...log,
            changer_name: changerName,
          };
        })
      );

      setAuditLogs(logsWithNames);
    } catch (error: any) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Fetch audit logs when patient is loaded
  useEffect(() => {
    if (patient?.id) {
      fetchAuditLogs(patient.id);
    }
  }, [patient?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(asset("/patients"))}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 bg-primary flex items-center justify-center">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl tracking-tight">Patient Details</span>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!patient) {
    return null;
  }

  const medicines = formatMedicines(patient.medicines);
  const additionalDocs = patient.additional_documents || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/patients"))} className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-primary flex items-center justify-center shrink-0">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-base sm:text-xl tracking-tight truncate">Patient Details</span>
          </div>
          
          {/* Other visits by this patient at this hospital */}
          {patient.patient_id && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0 h-9 sm:h-10 px-2 sm:px-3"
              onClick={() =>
                router.push(asset(`/patients/timeline/${encodeURIComponent(patient.hospital)}/${encodeURIComponent(patient.patient_id)}`))
              }
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </Button>
          )}

          {/* Download PDF button - only for admin/master users */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0 h-9 sm:h-10 px-2 sm:px-3"
              onClick={downloadMergedPdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Export PDF</span>
            </Button>
          )}
          
          {/* Delete button - only for master users */}
          {isMaster && (
            <AlertDialog
              onOpenChange={(open) => {
                // Every opening starts empty: a word typed and then cancelled
                // must not pre-arm the next attempt.
                if (!open) setDeleteConfirmText("");
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2 shrink-0 h-9 sm:h-10 px-2 sm:px-3">
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Patient Record</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete the record for <strong>{patient.patient_name}</strong>?
                    {patient.reference_number && (
                      <span className="block mt-1 font-mono text-sm">{patient.reference_number}</span>
                    )}
                    <span className="block mt-2 text-destructive">This action cannot be undone.</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && deleteConfirmed && !deleting) void handleDelete();
                    }}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="DELETE"
                    className="font-mono"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting || !deleteConfirmed}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Record"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {/* Patient Info Card */}
          <Card className="border-2">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-16 sm:w-16 bg-secondary flex items-center justify-center shrink-0">
                  <User className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg sm:text-2xl break-words">{patient.patient_name}</CardTitle>
                    <span className="px-2 py-1 bg-accent text-accent-foreground text-[10px] sm:text-sm font-medium shrink-0 max-w-[40%] truncate text-right">
                      {patient.hospital}
                    </span>
                  </div>
                  <CardDescription className="text-sm sm:text-base space-y-1 mt-1">
                    {patient.reference_number && (
                      <span className="block font-mono text-xs sm:text-sm font-medium text-foreground break-all">
                        {patient.reference_number}
                      </span>
                    )}
                    <span className="block">Patient ID: <span className="font-mono">{patient.patient_id || "N/A"}</span></span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-secondary">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Age</p>
                  <p className="font-semibold text-lg">{patient.age || "N/A"} years</p>
                </div>
                <div className="p-4 bg-secondary">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Gender</p>
                  <p className="font-semibold text-lg">{patient.gender || "N/A"}</p>
                </div>
                <div className="p-4 bg-secondary">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Visit Date</p>
                  <p className="font-semibold text-lg flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {patient.visit_date || "N/A"}
                  </p>
                </div>
                <div className="p-4 bg-secondary">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Doctor</p>
                  <p className="font-semibold text-lg flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    {patient.doctor_name || "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Diagnosis & Medicines */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Diagnosis */}
            <Card className="border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Diagnosis
                  </CardTitle>
                  {!isEditingDiagnosis && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={startEditingDiagnosis}
                      className="gap-1"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isEditingDiagnosis ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editedDiagnosis}
                      onChange={(e) => setEditedDiagnosis(e.target.value)}
                      placeholder="Enter diagnosis..."
                      className="min-h-[100px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={saveDiagnosis}
                        disabled={savingDiagnosis}
                        className="gap-1"
                      >
                        {savingDiagnosis ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelEditingDiagnosis}
                        disabled={savingDiagnosis}
                        className="gap-1"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-lg">{patient.diagnosis || "No diagnosis recorded"}</p>
                )}
              </CardContent>
            </Card>

            {/* Medicines */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5" />
                  Medicines
                </CardTitle>
              </CardHeader>
              <CardContent>
                {medicines.length > 0 ? (
                  <div className="space-y-2">
                    {medicines.map((med, index) => (
                      <div key={index} className="p-3 bg-secondary">
                        <p className="font-medium">{med.name}</p>
                        {(med.dosage || med.frequency || med.duration) && (
                          <p className="text-sm text-muted-foreground">
                            {[med.dosage, med.frequency, med.duration].filter(Boolean).join(" • ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No medicines recorded</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Prescription Image */}
          {patient.prescription_image_url && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Prescription Image
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => openPreview(patient.prescription_image_url!, `prescription_${patient.patient_id}.${patient.prescription_image_url!.split('.').pop()}`)}
                  >
                    <Eye className="h-4 w-4" />
                    View Prescription
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => downloadDocument(patient.prescription_image_url!, `prescription_${patient.patient_id}.${patient.prescription_image_url!.split('.').pop()}`)}
                    disabled={downloadingDoc === patient.prescription_image_url}
                  >
                    {downloadingDoc === patient.prescription_image_url ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Download Prescription
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional Documents */}
          <Card className="border-2 w-full max-w-full overflow-hidden box-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <File className="h-5 w-5" />
                Additional Documents
              </CardTitle>
              <CardDescription>
                Lab reports, scans, discharge summaries, and other documents
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {additionalDocs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 min-w-0">
                  {additionalDocs.map((doc, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 bg-secondary border border-border min-w-0 max-w-full overflow-hidden box-border"
                    >
                      <div className="h-10 w-10 sm:h-12 sm:w-12 bg-muted flex items-center justify-center shrink-0">
                        {doc.type === "PDF" ? (
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p
                          className="font-medium truncate text-sm sm:text-base"
                          title={doc.name}
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {doc.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{doc.type}</p>
                      </div>
                      <div className="flex gap-1 sm:gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 sm:h-10 sm:w-10 shrink-0"
                          onClick={() => openPreview(doc.url, doc.name)}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 sm:h-10 sm:w-10 shrink-0"
                          onClick={() => downloadDocument(doc.url, doc.name)}
                          disabled={downloadingDoc === doc.url}
                          title="Download"
                        >
                          {downloadingDoc === doc.url ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No additional documents uploaded</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit History / Audit Trail */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Edit History
              </CardTitle>
              <CardDescription>
                Track all changes made to this patient record
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAudit ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : auditLogs.length > 0 ? (
                <div className="space-y-3">
                  {auditLogs.map((log) => {
                    // Three kinds of entry now share this table. "record_created"
                    // and the "ai:" prefix are written when a scan is committed;
                    // everything else is a later edit caught by the
                    // patient_records_audit trigger. Rendering them all as
                    // "<field> updated" read as nonsense for the first two.
                    const isCreation = log.field_name === "record_created";
                    const isExtraction = log.field_name.startsWith("ai:");
                    const fieldLabel = (isExtraction ? log.field_name.slice(3) : log.field_name)
                      .replace(/_/g, " ");
                    return (
                    <div
                      key={log.id}
                      className={`p-3 sm:p-4 bg-secondary border-l-4 ${
                        isExtraction ? "border-yellow-600" : "border-primary"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                        <div className="flex-1 min-w-0 order-2 sm:order-1">
                          <p className="font-medium capitalize">
                            {isCreation
                              ? "Record created from a scan"
                              : isExtraction
                                ? `${fieldLabel} corrected after the scan`
                                : `${fieldLabel} updated`}
                          </p>
                          {isExtraction && (
                            <p className="text-xs text-muted-foreground mt-0.5 normal-case">
                              The scan read one value; this is what was saved instead.
                            </p>
                          )}
                          <div className="mt-2 space-y-1 text-sm break-words">
                            {isCreation ? (
                              <p className="text-foreground">
                                <span className="font-medium">Reference:</span>{" "}
                                <span className="font-mono">
                                  {log.new_value || (
                                    <span className="italic font-sans text-muted-foreground">(none)</span>
                                  )}
                                </span>
                              </p>
                            ) : (
                              <>
                                {log.old_value && (
                                  <p className="text-muted-foreground">
                                    <span className="font-medium">
                                      {isExtraction ? "Scan read:" : "From:"}
                                    </span>{" "}
                                    <span className="line-through">{log.old_value}</span>
                                  </p>
                                )}
                                <p className="text-foreground">
                                  <span className="font-medium">
                                    {isExtraction ? "Saved as:" : "To:"}
                                  </span>{" "}
                                  {log.new_value || <span className="italic text-muted-foreground">(empty)</span>}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-left sm:text-right text-xs sm:text-sm shrink-0 order-1 sm:order-2">
                          <p className="font-medium truncate">{log.changer_name}</p>
                          <p className="text-muted-foreground">
                            {new Date(log.changed_at).toLocaleDateString()}{" "}
                            {new Date(log.changed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No edit history available</p>
                  <p className="text-sm mt-1">Changes will appear here after edits are made</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <div className="h-4" />

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        isOpen={preview.isOpen}
        onClose={closePreview}
        documentUrl={preview.url}
        documentName={preview.name}
        onDownload={downloadPreviewDoc}
        isDownloading={downloadingDoc === preview.filePath}
      />
    </div>
  );
};

export default PatientDetail;

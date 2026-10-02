"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent } from "@/components/cpms/ui/card";
import { Progress } from "@/components/cpms/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/cpms/ui/select";
import {
  Plus,
  X,
  Camera,
  Upload,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import DocumentCamera from "@/components/cpms/DocumentCamera";

const DOCUMENT_TYPES = [
  { value: "PIS", label: "Patient Information Sheet (PIS)" },
  { value: "ICF", label: "Signed Informed Consent Form (ICF)" },
  { value: "TRF", label: "Test Requisition Form (TRF)" },
  { value: "ADD_RX", label: "Additional Prescription" },
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const IMAGE_COMPRESSION_QUALITY = 0.7;
const IMAGE_MAX_DIMENSION = 1600;

export interface CategorizedDocument {
  id: string;
  file: File;
  preview: string | null;
  docType: DocumentType;
  originalSize: number;
  compressedSize: number;
  status: "compressing" | "ready" | "error";
  errorMessage?: string;
}

interface AdditionalDocumentsUploadProps {
  documents: CategorizedDocument[];
  // A setState rather than a plain callback: photos arrive one capture at a
  // time and each compresses in the background, so an add that rebuilt the
  // list from a captured `documents` would drop whatever landed meanwhile.
  onChange: Dispatch<SetStateAction<CategorizedDocument[]>>;
}

/* ── Compression helpers ── */

const compressImage = (file: File): Promise<File> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
        const ratio = Math.min(IMAGE_MAX_DIMENSION / width, IMAGE_MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          const compressed = new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() });
          resolve(compressed);
        },
        "image/jpeg",
        IMAGE_COMPRESSION_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });

const compressFile = async (file: File): Promise<File> => {
  if (file.type.startsWith("image/")) {
    return compressImage(file);
  }
  // PDFs: no client-side compression available – pass through
  return file;
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* ── Preview Modal ── */
const PreviewModal = ({ src, type, onClose }: { src: string; type: string; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="relative max-w-3xl w-full max-h-[85vh] bg-card border-2 border-border rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium">Document Preview</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="overflow-auto max-h-[calc(85vh-52px)] flex items-center justify-center p-4">
        {type === "pdf" ? (
          <iframe src={src} className="w-full h-[70vh] border-0" title="PDF Preview" />
        ) : (
          <img src={src} alt="Preview" className="max-w-full max-h-[70vh] object-contain" />
        )}
      </div>
    </div>
  </div>
);

/* ── Main Component ── */
const AdditionalDocumentsUpload = ({ documents, onChange }: AdditionalDocumentsUploadProps) => {
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | "">("");
  const [previewDoc, setPreviewDoc] = useState<{ src: string; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  // Page numbering carries across trips to the camera, so a second visit
  // does not restart at "page 1".
  const pageOffsetRef = useRef(0);

  const addFiles = useCallback(
    async (files: ArrayLike<File>) => {
      if (!selectedDocType) {
        toast.error("Please select a document type first");
        return;
      }

      const incoming: CategorizedDocument[] = [];

      for (const file of Array.from(files)) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          const ext = file.name.split(".").pop()?.toUpperCase() || "Unknown";
          toast.error(`${file.name}: Unsupported type (${ext}). Use PDF, JPG, or PNG.`);
          continue;
        }

        const doc: CategorizedDocument = {
          id: generateId(),
          file,
          preview: null,
          docType: selectedDocType as DocumentType,
          originalSize: file.size,
          compressedSize: file.size,
          status: "compressing",
        };
        incoming.push(doc);
      }

      if (incoming.length === 0) return;

      // Add placeholders immediately (show compressing state)
      onChange((prev) => [...prev, ...incoming]);

      // Compress each file
      const processed = await Promise.all(
        incoming.map(async (doc) => {
          try {
            const compressed = await compressFile(doc.file);
            if (compressed.size > MAX_FILE_SIZE_BYTES) {
              return {
                ...doc,
                status: "error" as const,
                errorMessage: `File still ${(compressed.size / 1024 / 1024).toFixed(1)} MB after compression (max ${MAX_FILE_SIZE_MB} MB)`,
              };
            }
            const preview = compressed.type.startsWith("image/")
              ? URL.createObjectURL(compressed)
              : null;
            return {
              ...doc,
              file: compressed,
              compressedSize: compressed.size,
              preview,
              status: "ready" as const,
            };
          } catch {
            return { ...doc, status: "error" as const, errorMessage: "Compression failed" };
          }
        }),
      );

      // Swap each placeholder for its processed self. Matching on id instead
      // of rebuilding the list keeps anything added -- or removed -- while
      // this batch was compressing.
      onChange((prev) => prev.map((doc) => processed.find((p) => p.id === doc.id) ?? doc));

      const readyCount = processed.filter((d) => d.status === "ready").length;
      if (readyCount > 0) toast.success(`${readyCount} file(s) optimized and added`);
    },
    [onChange, selectedDocType],
  );

  const removeDoc = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (doc?.preview) URL.revokeObjectURL(doc.preview);
    onChange((prev) => prev.filter((d) => d.id !== id));
  };

  const openCamera = () => {
    if (!selectedDocType) {
      toast.error("Please select a document type first");
      return;
    }
    pageOffsetRef.current = documents.filter((d) => d.docType === selectedDocType).length;
    setIsCameraOpen(true);
  };

  const openPreview = (doc: CategorizedDocument) => {
    if (doc.status !== "ready") return;
    const src = doc.preview || URL.createObjectURL(doc.file);
    const type = doc.file.type === "application/pdf" ? "pdf" : "image";
    setPreviewDoc({ src, type });
  };

  const groupedByType = DOCUMENT_TYPES.map((dt) => ({
    ...dt,
    docs: documents.filter((d) => d.docType === dt.value),
  })).filter((g) => g.docs.length > 0);

  return (
    <>
      <div className="space-y-5">
        {/* Document type selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Document Type *</label>
          <Select value={selectedDocType} onValueChange={(v) => setSelectedDocType(v as DocumentType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select document type" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((dt) => (
                <SelectItem key={dt.value} value={dt.value}>
                  {dt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Upload area */}
        <div
          className={`border-2 border-dashed p-6 text-center transition-colors ${
            selectedDocType
              ? "cursor-pointer hover:border-primary"
              : "opacity-50 cursor-not-allowed"
          }`}
          onClick={() => {
            if (!selectedDocType) {
              toast.error("Please select a document type first");
              return;
            }
            fileInputRef.current?.click();
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                addFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <Plus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="font-medium">Add Files</p>
          <p className="text-sm text-muted-foreground mb-4">
            PDF, JPG, PNG · Multi-page documents supported · Auto-compressed to ≤{MAX_FILE_SIZE_MB} MB
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* Carries its own handler rather than relying on the click
                bubbling to the drop zone, which is how its sibling below
                works. Two adjacent buttons driven by opposite mechanisms is a
                trap: anything that stops propagation between them turns this
                one into a silent no-op. */}
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={(e) => {
                e.stopPropagation();
                if (!selectedDocType) {
                  toast.error("Please select a document type first");
                  return;
                }
                fileInputRef.current?.click();
              }}
            >
              <Upload className="h-4 w-4" />
              Choose Files
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
        </div>

        {/* Grouped document list */}
        {groupedByType.length > 0 && (
          <div className="space-y-4">
            {groupedByType.map((group) => (
              <div key={group.value} className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {group.label}
                  <span className="text-xs text-muted-foreground font-normal">({group.docs.length})</span>
                </h4>
                <div className="grid gap-2">
                  {group.docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 sm:gap-3 p-3 bg-secondary border border-border rounded-md min-w-0 max-w-full overflow-hidden"
                    >
                      {/* Thumbnail */}
                      {doc.status === "compressing" ? (
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-muted flex items-center justify-center shrink-0 rounded">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : doc.preview ? (
                        <img
                          src={doc.preview}
                          alt={doc.file.name}
                          className="w-10 h-10 sm:w-12 sm:h-12 object-cover border rounded shrink-0 cursor-pointer"
                          onClick={() => openPreview(doc)}
                        />
                      ) : (
                        <div
                          className="w-10 h-10 sm:w-12 sm:h-12 bg-muted flex items-center justify-center shrink-0 rounded cursor-pointer"
                          onClick={() => openPreview(doc)}
                        >
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={doc.file.name}>
                          {doc.file.name}
                        </p>
                        {doc.status === "compressing" ? (
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={50} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Optimizing…</span>
                          </div>
                        ) : doc.status === "error" ? (
                          <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span className="truncate">{doc.errorMessage}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-600" />
                              {(doc.compressedSize / 1024 / 1024).toFixed(2)} MB
                              {doc.originalSize !== doc.compressedSize && (
                                <span className="text-green-600">
                                  (saved {Math.round((1 - doc.compressedSize / doc.originalSize) * 100)}%)
                                </span>
                              )}
                            </span>
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {doc.status === "ready" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openPreview(doc)}
                            aria-label="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeDoc(doc.id)}
                          aria-label="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DocumentCamera
        open={isCameraOpen}
        title={`Take Photo · ${DOCUMENT_TYPES.find((dt) => dt.value === selectedDocType)?.label ?? ""}`}
        hint="Each capture is added as another page."
        instruction="Align the entire document inside the frame."
        multiple
        fileName={(n) => `${selectedDocType}-page-${pageOffsetRef.current + n}.jpg`}
        onCapture={(file) => addFiles([file])}
        onClose={() => setIsCameraOpen(false)}
      />

      {/* Preview modal */}
      {previewDoc && <PreviewModal src={previewDoc.src} type={previewDoc.type} onClose={() => setPreviewDoc(null)} />}
    </>
  );
};

export default AdditionalDocumentsUpload;
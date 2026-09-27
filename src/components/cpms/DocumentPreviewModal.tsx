"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/cpms/ui/dialog";
import { Button } from "@/components/cpms/ui/button";
import { Download, ExternalLink, Loader2, X, Maximize2, Minimize2 } from "lucide-react";
import ImagePreviewViewer from "@/components/cpms/ImagePreviewViewer";

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentUrl: string | null;
  documentName: string;
  onDownload: () => void;
  isDownloading?: boolean;
}

const DocumentPreviewModal = ({
  isOpen,
  onClose,
  documentUrl,
  documentName,
  onDownload,
  isDownloading = false,
}: DocumentPreviewModalProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isPdf = documentName.toLowerCase().endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(documentName);
  // Android Chrome has no built-in PDF viewer: the iframe below renders blank
  // there, and still fires onLoad, so no error ever showed. Browsers report
  // this as navigator.pdfViewerEnabled; where they don't say, assume inline
  // works, as it did before.
  const canShowPdfInline =
    typeof navigator === "undefined" ||
    (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
  const pdfFallback = isPdf && !canShowPdfInline;

  // Reset when the dialog opens, or when it is handed a different document
  // while already open. Adjusting state during render rather than in an effect
  // is what React recommends for deriving state from a changed prop: the effect
  // version rendered the previous document's error and spinner state for one
  // frame before correcting itself.
  const [shown, setShown] = useState({ isOpen, documentUrl });
  if (shown.isOpen !== isOpen || shown.documentUrl !== documentUrl) {
    setShown({ isOpen, documentUrl });
    if (isOpen) {
      setLoading(true);
      setError(null);
      setIsFullscreen(false);
    }
  }

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`flex flex-col p-0 gap-0 transition-all duration-200 ${
          isFullscreen
            ? "max-w-[100vw] w-[100vw] h-[100vh] rounded-none"
            : "max-w-4xl w-[95vw] h-[90vh] sm:h-[85vh]"
        }`}
      >
        <DialogHeader className="p-2 sm:p-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <DialogTitle className="truncate flex-1 text-sm sm:text-base">
              {documentName}
            </DialogTitle>
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                disabled={isDownloading}
                className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/50 relative min-h-0">
          {loading && !pdfFallback && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <X className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <p className="text-destructive font-medium">{error}</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={onDownload}
                >
                  Download Instead
                </Button>
              </div>
            </div>
          )}

          {documentUrl && !error && (
            <>
              {pdfFallback ? (
                <div className="flex items-center justify-center h-full p-6">
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">
                      This browser can&apos;t show PDFs here. Open it in a new tab or download it.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => window.open(documentUrl, "_blank", "noopener")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open in new tab
                      </Button>
                      <Button className="gap-2" onClick={onDownload} disabled={isDownloading}>
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              ) : isPdf ? (
                <iframe
                  src={documentUrl}
                  className="w-full h-full border-0"
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setError("Failed to load PDF");
                  }}
                  title={documentName}
                />
              ) : isImage ? (
                <>
                  {/* Hidden img to detect load/error */}
                  <img
                    src={documentUrl}
                    alt=""
                    className="hidden"
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setLoading(false);
                      setError("Failed to load image");
                    }}
                  />
                  {!loading && (
                    <ImagePreviewViewer
                      src={documentUrl}
                      alt={documentName}
                      className="w-full h-full"
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-muted-foreground mb-4">
                      Preview not available for this file type
                    </p>
                    <Button onClick={onDownload}>Download to View</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPreviewModal;

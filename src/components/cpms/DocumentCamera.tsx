"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";

// Scan geometry. The paperwork photographed in CPMS is portrait 5:7 -- a sheet
// a shade wider than A4's 1:1.41 -- so the scan window is a centred 5:7
// rectangle rather than whatever shape the sensor happens to hand back.
const CAPTURE_ASPECT = 5 / 7;
// Hold the window just off the frame edge, so its outline is always visible.
const CAPTURE_FRAME_INSET = 0.98;
// The sheet is lined up against a guide drawn inside the window; the gap
// between the two is the margin that keeps a slightly skewed page from losing
// a corner to the crop.
const CAPTURE_GUIDE_INSET = 0.9;
const CAPTURE_QUALITY = 0.9;

/** Largest centred 5:7 rectangle that fits inside w x h, held off the edges. */
const fitCaptureRect = (w: number, h: number) => {
  let width = w * CAPTURE_FRAME_INSET;
  let height = width / CAPTURE_ASPECT;
  const maxHeight = h * CAPTURE_FRAME_INSET;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * CAPTURE_ASPECT;
  }
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
};

interface CaptureBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DocumentCameraProps {
  open: boolean;
  /** Heading on the viewfinder, e.g. the document type being photographed. */
  title: string;
  /** Line under the heading, shown until the first capture. */
  hint?: string;
  /** Keep the viewfinder open across captures, for multi-page documents. */
  multiple?: boolean;
  /** Name for the nth capture of this session, 1-based. */
  fileName: (captureIndex: number) => string;
  onCapture: (file: File) => void;
  onClose: () => void;
}

/**
 * Full-screen viewfinder that crops to a fixed 5:7 window. Both scan steps use
 * it, so the geometry an operator lines a page up against is the same one in
 * both places -- and there is one copy of it to change.
 */
const DocumentCamera = ({
  open,
  title,
  hint,
  multiple = false,
  fileName,
  onCapture,
  onClose,
}: DocumentCameraProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCloseRef = useRef(onClose);

  // Where the 5:7 window sits on screen, in stage pixels. Null until the
  // stream has reported a frame size.
  const [captureBox, setCaptureBox] = useState<CaptureBox | null>(null);
  const [captureCount, setCaptureCount] = useState(0);

  // Callers pass inline handlers; reading onClose through a ref keeps the
  // camera from being torn down and reopened on every parent render.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Hold the stream for exactly as long as the viewfinder is up, so the camera
  // light never stays on behind a closed step.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("This browser cannot open the camera here. Use file upload instead.");
        onCloseRef.current();
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            // Ask for a portrait frame shaped like the page. All three are
            // ideal, not exact, so a webcam that only does 16:9 still opens --
            // the window below adapts to whatever frame actually arrives.
            width: { ideal: 1440 },
            height: { ideal: 2016 },
            aspectRatio: { ideal: CAPTURE_ASPECT },
          },
        });
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = media;
        if (videoRef.current) videoRef.current.srcObject = media;
      } catch (error) {
        console.error("Camera access error:", error);
        toast.error("Unable to access camera. Please check permissions or use file upload instead.");
        onCloseRef.current();
      }
    };

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  // Keep the outlined window lined up with the letterboxed video, so the
  // rectangle on screen is exactly the rectangle capturePhoto crops.
  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;

    const update = () => {
      const { videoWidth, videoHeight } = video;
      const { clientWidth, clientHeight } = stage;
      if (!videoWidth || !videoHeight || !clientWidth || !clientHeight) return;
      // object-contain centres and letterboxes the frame inside the stage.
      const scale = Math.min(clientWidth / videoWidth, clientHeight / videoHeight);
      const shownWidth = videoWidth * scale;
      const shownHeight = videoHeight * scale;
      const rect = fitCaptureRect(shownWidth, shownHeight);
      setCaptureBox({
        left: (clientWidth - shownWidth) / 2 + rect.x,
        top: (clientHeight - shownHeight) / 2 + rect.y,
        width: rect.width,
        height: rect.height,
      });
    };

    update();
    // loadedmetadata for the first frame size, resize for a phone rotating.
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [open]);

  const close = () => {
    setCaptureCount(0);
    setCaptureBox(null);
    onClose();
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // videoWidth stays 0 until the first frame arrives; capturing before that
    // writes a blank page.
    if (!video || !canvas || !video.videoWidth) return;

    // Crop to the same 5:7 window the page was lined up in, so what gets filed
    // is the document rather than the desk around it.
    const crop = fitCaptureRect(video.videoWidth, video.videoHeight);
    canvas.width = Math.round(crop.width);
    canvas.height = Math.round(crop.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const index = captureCount + 1;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Could not save that photo. Please try again.");
          return;
        }
        onCapture(new File([blob], fileName(index), { type: "image/jpeg" }));
        if (multiple) {
          setCaptureCount(index);
        } else {
          close();
        }
      },
      "image/jpeg",
      CAPTURE_QUALITY,
    );
  };

  if (!open) return null;

  const subtitle =
    multiple && captureCount > 0
      ? `${captureCount} page${captureCount === 1 ? "" : "s"} captured`
      : hint;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close camera">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div ref={stageRef} className="relative flex-1 min-h-0 m-4 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
        />
        {captureBox && (
          <div
            className="absolute border-2 border-primary pointer-events-none"
            style={{
              left: captureBox.left,
              top: captureBox.top,
              width: captureBox.width,
              height: captureBox.height,
              // Dim everything outside the window, so the crop the operator is
              // given is the crop they were shown.
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            }}
          >
            <div
              className="absolute border-2 border-dashed border-primary/70"
              style={{ inset: `${((1 - CAPTURE_GUIDE_INSET) / 2) * 100}%` }}
            />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="p-4 border-t border-border space-y-3">
        <p className="text-xs text-center text-muted-foreground">
          Lay the whole document inside the dashed guide. The photo is cropped to the 5:7
          window, so anything outside it is discarded.
        </p>
        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={close}>
            {multiple && captureCount > 0 ? "Done" : "Cancel"}
          </Button>
          <Button onClick={capturePhoto} className="gap-2" disabled={!captureBox}>
            <Camera className="h-4 w-4" />
            Capture
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DocumentCamera;

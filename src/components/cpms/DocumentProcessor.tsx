"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/cpms/ui/button";
import {
  Loader2,
  Crop,
  RotateCcw,
  Check,
  SunMedium,
  Contrast,
  ImageIcon,
  Sparkles,
  X,
} from "lucide-react";
import {
  type Point,
  type DetectionResult,
  type ImageFilter,
  detectEdges,
  perspectiveCorrect,
  applyFilter,
  imageDataFromSrc,
  imageDataToDataUrl,
  imageDataToFile,
} from "@/lib/cpms/document-processor";
import { toast } from "sonner";

interface DocumentProcessorProps {
  /** The original captured image as a data-URL */
  imageSrc: string;
  /** Called when user accepts the processed result */
  onAccept: (processedFile: File, processedPreview: string) => void;
  /** Called when user skips / cancels processing */
  onSkip: () => void;
}

type Stage = "loading" | "crop" | "enhance" | "applying";

const HANDLE_RADIUS = 14;

const FILTER_OPTIONS: { key: ImageFilter; label: string; icon: React.ReactNode }[] = [
  { key: "none", label: "Original", icon: <ImageIcon className="h-4 w-4" /> },
  { key: "grayscale", label: "Grayscale", icon: <Contrast className="h-4 w-4" /> },
  { key: "bw", label: "B & W", icon: <SunMedium className="h-4 w-4" /> },
  { key: "auto-enhance", label: "Auto Enhance", icon: <Sparkles className="h-4 w-4" /> },
];

const DocumentProcessor = ({ imageSrc, onAccept, onSkip }: DocumentProcessorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [stage, setStage] = useState<Stage>("loading");
  const [sourceImageData, setSourceImageData] = useState<ImageData | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [corners, setCorners] = useState<[Point, Point, Point, Point] | null>(null);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<ImageFilter>("none");
  const [croppedImageData, setCroppedImageData] = useState<ImageData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);

  // ---- Phase 1: Load image & run edge detection ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStage("loading");
        const imgData = await imageDataFromSrc(imageSrc);
        if (cancelled) return;
        setSourceImageData(imgData);

        const result = await detectEdges(imgData);
        if (cancelled) return;
        setDetection(result);
        setCorners(result.corners);
        setAutoDetected(result.detected);
        setStage("crop");
      } catch (err) {
        console.warn("Document processing init failed:", err);
        if (!cancelled) {
          toast.error("Could not process image. Using original.");
          onSkip();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [imageSrc]);

  // ---- Draw overlay on canvas ----
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !corners || !detection) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Compute image display bounds (object-contain)
    const imgAspect = detection.width / detection.height;
    const cAspect = rect.width / rect.height;
    let drawW: number, drawH: number, offX: number, offY: number;
    if (imgAspect > cAspect) {
      drawW = rect.width;
      drawH = rect.width / imgAspect;
      offX = 0;
      offY = (rect.height - drawH) / 2;
    } else {
      drawH = rect.height;
      drawW = rect.height * imgAspect;
      offX = (rect.width - drawW) / 2;
      offY = 0;
    }

    // Semi-transparent overlay outside crop region
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Clear the crop polygon area
    ctx.save();
    ctx.beginPath();
    corners.forEach((p, i) => {
      const cx = offX + p.x * drawW;
      const cy = offY + p.y * drawH;
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fill();
    ctx.restore();

    // Draw crop border
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.lineWidth = 2;
    ctx.beginPath();
    corners.forEach((p, i) => {
      const cx = offX + p.x * drawW;
      const cy = offY + p.y * drawH;
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    // Corner handles
    corners.forEach((p) => {
      const cx = offX + p.x * drawW;
      const cy = offY + p.y * drawH;
      ctx.beginPath();
      ctx.arc(cx, cy, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(var(--primary))";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, HANDLE_RADIUS - 3, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(var(--primary-foreground))";
      ctx.fill();
    });
  }, [corners, detection]);

  useEffect(() => {
    if (stage === "crop") drawOverlay();
  }, [stage, corners, drawOverlay]);

  // Redraw on resize
  useEffect(() => {
    if (stage !== "crop") return;
    const handler = () => drawOverlay();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [stage, drawOverlay]);

  // ---- Pointer interactions for dragging handles ----
  const getImageBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container || !detection) return null;
    const rect = container.getBoundingClientRect();
    const imgAspect = detection.width / detection.height;
    const cAspect = rect.width / rect.height;
    let drawW: number, drawH: number, offX: number, offY: number;
    if (imgAspect > cAspect) {
      drawW = rect.width;
      drawH = rect.width / imgAspect;
      offX = 0;
      offY = (rect.height - drawH) / 2;
    } else {
      drawH = rect.height;
      drawW = rect.height * imgAspect;
      offX = (rect.width - drawW) / 2;
      offY = 0;
    }
    return { drawW, drawH, offX, offY, rect };
  }, [detection]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (stage !== "crop" || !corners) return;
      const bounds = getImageBounds();
      if (!bounds) return;
      const { drawW, drawH, offX, offY, rect } = bounds;

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // Find closest handle
      let closest = -1;
      let closestDist = Infinity;
      corners.forEach((p, i) => {
        const cx = offX + p.x * drawW;
        const cy = offY + p.y * drawH;
        const dist = Math.hypot(px - cx, py - cy);
        if (dist < HANDLE_RADIUS * 2 && dist < closestDist) {
          closest = i;
          closestDist = dist;
        }
      });

      if (closest >= 0) {
        setActiveHandle(closest);
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }
    },
    [stage, corners, getImageBounds]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activeHandle === null || !corners) return;
      const bounds = getImageBounds();
      if (!bounds) return;
      const { drawW, drawH, offX, offY, rect } = bounds;

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const nx = Math.max(0, Math.min(1, (px - offX) / drawW));
      const ny = Math.max(0, Math.min(1, (py - offY) / drawH));

      setCorners((prev) => {
        if (!prev) return prev;
        const next = [...prev] as [Point, Point, Point, Point];
        next[activeHandle] = { x: nx, y: ny };
        return next;
      });
    },
    [activeHandle, corners, getImageBounds]
  );

  const handlePointerUp = useCallback(() => {
    setActiveHandle(null);
  }, []);

  // ---- Reset corners to detection result ----
  const resetCorners = () => {
    if (detection) setCorners(detection.corners);
  };

  // ---- Apply crop & move to enhance stage ----
  const applyCrop = async () => {
    if (!sourceImageData || !corners) return;
    setStage("applying");
    try {
      const corrected = await perspectiveCorrect(sourceImageData, corners);
      setCroppedImageData(corrected);
      setPreviewUrl(imageDataToDataUrl(corrected));
      setStage("enhance");
    } catch (err) {
      console.warn("Crop failed:", err);
      toast.error("Crop failed. Using original image.");
      onSkip();
    }
  };

  // ---- Apply filter and update preview ----
  useEffect(() => {
    if (!croppedImageData) return;
    const filtered = applyFilter(croppedImageData, selectedFilter);
    setPreviewUrl(imageDataToDataUrl(filtered));
  }, [selectedFilter, croppedImageData]);

  // ---- Accept processed image ----
  const acceptResult = async () => {
    if (!croppedImageData) return;
    setStage("applying");
    try {
      const filtered = applyFilter(croppedImageData, selectedFilter);
      const file = await imageDataToFile(filtered, `processed-${Date.now()}.jpg`, 0.9);
      const url = imageDataToDataUrl(filtered);
      onAccept(file, url);
    } catch (err) {
      console.warn("Accept failed:", err);
      toast.error("Processing failed. Using original image.");
      onSkip();
    }
  };

  // ---- RENDER ----

  if (stage === "loading" || stage === "applying") {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {stage === "loading" ? "Detecting document edges…" : "Applying corrections…"}
        </p>
      </div>
    );
  }

  if (stage === "crop") {
    return (
      <div className="space-y-3">
        {/* Status badge */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Crop className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {autoDetected
                ? "Document edges detected — adjust if needed"
                : "Auto-detect failed — drag corners to crop"}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onSkip}>
            <X className="h-3 w-3" /> Skip
          </Button>
        </div>

        {/* Canvas overlay on image */}
        <div
          ref={containerRef}
          className="relative w-full h-[320px] sm:h-[420px] bg-secondary border-2 border-border overflow-hidden touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            src={imageSrc}
            alt="Prescription"
            draggable={false}
            className="absolute inset-0 m-auto max-w-full max-h-full object-contain pointer-events-none"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={resetCorners}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" className="gap-1 flex-1" onClick={applyCrop}>
            <Check className="h-3.5 w-3.5" /> Apply Crop
          </Button>
        </div>
      </div>
    );
  }

  // stage === "enhance"
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Enhance image quality</span>
        </div>
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onSkip}>
          <X className="h-3 w-3" /> Use Original
        </Button>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="w-full h-[320px] sm:h-[420px] bg-secondary border-2 border-border overflow-hidden flex items-center justify-center">
          <img
            src={previewUrl}
            alt="Processed preview"
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        </div>
      )}

      {/* Filter toggles */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            variant={selectedFilter === opt.key ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setSelectedFilter(opt.key)}
          >
            {opt.icon}
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => {
            setStage("crop");
            setSelectedFilter("none");
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Re-crop
        </Button>
        <Button size="sm" className="gap-1 flex-1" onClick={acceptResult}>
          <Check className="h-3.5 w-3.5" /> Use Processed Image
        </Button>
      </div>
    </div>
  );
};

export default DocumentProcessor;
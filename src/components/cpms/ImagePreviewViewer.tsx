"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/cpms/ui/button";
import { RotateCw, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";

interface ImagePreviewViewerProps {
  src: string;
  alt?: string;
  /** Tailwind classes for the outer container (controls height). */
  className?: string;
  /** Optional overlay element rendered top-right (e.g. clear button). */
  topRightSlot?: React.ReactNode;
}

/**
 * Mobile-friendly image preview with pinch/scroll zoom, drag-to-pan, and rotation.
 * - Pinch with two fingers to zoom (touch).
 * - Mouse wheel zooms on desktop.
 * - Double-tap / double-click toggles 1x ↔ 2x.
 * - Drag to pan when zoomed in.
 * - Buttons: rotate 90°, zoom in/out, reset.
 */
const MIN_SCALE = 1;
const MAX_SCALE = 5;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const ImagePreviewViewer = ({ src, alt, className, topRightSlot }: ImagePreviewViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // Pointer / gesture state
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Mirrors `pointers.current.size > 0` as state. The transform transition has
  // to be off while a gesture is in flight, and render cannot read a ref -- a
  // ref carries no subscription, so the style it produced was whatever the last
  // unrelated re-render happened to see. Two transitions per gesture, and the
  // pan/pinch handlers already re-render on every move.
  const [gesturing, setGesturing] = useState(false);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = useRef<number>(0);

  const reset = () => {
    setScale(1);
    setRotation(0);
    setTx(0);
    setTy(0);
  };

  const setScaleClamped = (next: number) => {
    const s = clamp(next, MIN_SCALE, MAX_SCALE);
    if (s === 1) {
      setTx(0);
      setTy(0);
    }
    setScale(s);
  };

  const rotate = () => setRotation((r) => (r + 90) % 360);

  // Reset the transform whenever the source changes. Adjusting state during
  // render rather than in an effect is React's recommended shape for this: the
  // effect version painted the new image once at the previous image's zoom,
  // rotation and pan before correcting itself.
  const [shownSrc, setShownSrc] = useState(src);
  if (shownSrc !== src) {
    setShownSrc(src);
    reset();
  }

  // Wheel zoom (desktop). Use non-passive listener so we can preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setScaleClamped(scale * (1 + delta));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scale]);

  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = { dist: distance(a, b), scale };
      panStart.current = null;
    } else if (pointers.current.size === 1) {
      // Double-tap detection
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setScaleClamped(scale > 1 ? 1 : 2);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      panStart.current = { x: e.clientX, y: e.clientY, tx, ty };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const newDist = distance(a, b);
      const ratio = newDist / pinchStart.current.dist;
      setScaleClamped(pinchStart.current.scale * ratio);
      return;
    }

    if (pointers.current.size === 1 && panStart.current && scale > 1) {
      setTx(panStart.current.tx + (e.clientX - panStart.current.x));
      setTy(panStart.current.ty + (e.clientY - panStart.current.y));
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      panStart.current = null;
      setGesturing(false);
    }
  };

  const cursor = scale > 1 ? "grab" : "zoom-in";

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden border-2 border-border bg-secondary touch-none select-none ${className ?? "w-full h-[300px] sm:h-[400px]"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      style={{ cursor }}
      role="img"
      aria-label={alt || "Image preview"}
    >
      <img
        src={src}
        alt={alt || "Preview"}
        draggable={false}
        className="absolute inset-0 m-auto max-w-full max-h-full object-contain pointer-events-none will-change-transform"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotation}deg)`,
          transition: gesturing ? "none" : "transform 120ms ease-out",
        }}
      />

      {/* Controls */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/90 backdrop-blur border border-border rounded-md p-1 shadow-md">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); setScaleClamped(scale - 0.5); }}
          aria-label="Zoom out"
          disabled={scale <= MIN_SCALE}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs font-mono tabular-nums w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); setScaleClamped(scale + 0.5); }}
          aria-label="Zoom in"
          disabled={scale >= MAX_SCALE}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); rotate(); }}
          aria-label="Rotate 90 degrees"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); reset(); }}
          aria-label="Reset view"
          disabled={scale === 1 && rotation === 0 && tx === 0 && ty === 0}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {topRightSlot && (
        <div className="absolute top-2 right-2 z-10">{topRightSlot}</div>
      )}

      {/* Hint shown only at default state */}
      {scale === 1 && rotation === 0 && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-background/80 backdrop-blur text-[10px] text-muted-foreground rounded border border-border pointer-events-none">
          Pinch / scroll to zoom · double-tap to toggle
        </div>
      )}
    </div>
  );
};

export default ImagePreviewViewer;
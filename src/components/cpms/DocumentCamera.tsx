"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { guideRect, guideToFrameCrop, type Rect } from "@/lib/cpms/scan-geometry";

// Where the guide sits on screen, and how that maps onto the camera frame, is
// in lib/cpms/scan-geometry -- one module for both, so the rectangle the
// operator lines a page up against is the rectangle that gets cropped.
const CAPTURE_QUALITY = 0.9;

// The four corner marks, drawn over the dashed outline.
const CORNERS = [
  "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
  "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
] as const;

/**
 * Put the camera at 1x where the browser exposes zoom (Chrome on Android).
 *
 * Some phones open the rear camera slightly zoomed in, or remember the last
 * app's zoom. 1x is the widest view of the main lens, and the most of the page
 * the operator can fit in the frame. Clamped to what the device allows -- a
 * camera whose minimum is above 1 gets its minimum -- and best-effort: a
 * browser without zoom support, or one that refuses, keeps its own default.
 */
async function resetZoom(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & {
    zoom?: { min: number; max: number };
  }) | undefined;
  if (!track || !caps?.zoom) return;
  const zoom = Math.min(Math.max(1, caps.zoom.min), caps.zoom.max);
  try {
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
  } catch {
    // Not supported on this device after all; leave the camera as it opened.
  }
}

interface DocumentCameraProps {
  open: boolean;
  /** Heading on the viewfinder, e.g. the document type being photographed. */
  title: string;
  /** Line under the heading, shown until the first capture. */
  hint?: string;
  /** The instruction over the controls. Names the kind of document. */
  instruction?: string;
  /** Keep the viewfinder open across captures, for multi-page documents. */
  multiple?: boolean;
  /** Name for the nth capture of this session, 1-based. */
  fileName: (captureIndex: number) => string;
  onCapture: (file: File) => void;
  onClose: () => void;
}

/**
 * Full-screen document scanner: the camera fills the stage, a single 5:7
 * guide is cut out of a dark mask, and Capture crops the frame to exactly what
 * was inside the guide. Both scan steps use it, so the geometry an operator
 * lines a page up against is the same one in both places -- and there is one
 * copy of it to change.
 */
const DocumentCamera = ({
  open,
  title,
  hint,
  instruction = "Align the entire prescription inside the frame.",
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

  // Where the guide sits on screen, in stage pixels. Null until the stream has
  // reported a frame size, which is also what enables Capture. The guide
  // depends on the frame's shape as well as the stage's, since it is laid out
  // on the visible picture.
  const [guide, setGuide] = useState<Rect | null>(null);
  const [captureCount, setCaptureCount] = useState(0);

  // Callers pass inline handlers; reading onClose through a ref keeps the
  // camera from being torn down and reopened on every parent render.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Stable identity (onClose is read through the ref), so the camera effect can
  // call it without listing a value that changes on every parent render.
  const close = useCallback(() => {
    setCaptureCount(0);
    setGuide(null);
    onCloseRef.current();
  }, []);

  // Hold the stream for exactly as long as the viewfinder is up, so the camera
  // light never stays on behind a closed step.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("This browser cannot open the camera here. Use file upload instead.");
        close();
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            // A large frame in the sensor's own 4:3 shape, and no aspect
            // ratio. Asking for a page-shaped 5:7 frame made browsers cut it
            // out of the sensor image -- a digital zoom -- so the operator saw
            // a narrow, zoomed-in view. The 5:7 crop is taken afterwards, from
            // the full field of view. Ideal, not exact, so any camera opens.
            width: { ideal: 2560 },
            height: { ideal: 1920 },
            // Chrome: deliver the camera's native frame rather than one
            // cropped and scaled to the numbers above. Unknown elsewhere,
            // and harmless.
            resizeMode: { ideal: "none" },
          } as MediaTrackConstraints,
        });
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = media;
        await resetZoom(media);
        if (videoRef.current) videoRef.current.srcObject = media;
      } catch (error) {
        // Dismissing the viewfinder before the permission prompt resolves
        // rejects this promise with AbortError. That is the operator closing
        // the camera, not a camera fault, and reporting it drops an error toast
        // over the form they have just gone back to.
        if (cancelled) return;
        console.error("Camera access error:", error);
        toast.error("Unable to access camera. Please check permissions or use file upload instead.");
        // close(), not onClose(): the counter and the guide have to be reset
        // too, or the next session resumes the previous one's page numbering.
        close();
      }
    };

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open, close]);

  // Re-lay the guide whenever the stage or the frame changes shape -- the
  // first frame arriving, a phone rotating, the browser bar collapsing.
  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;

    const update = () => {
      const { clientWidth, clientHeight } = stage;
      if (!video.videoWidth || !video.videoHeight || !clientWidth || !clientHeight) return;
      setGuide(guideRect(clientWidth, clientHeight, video.videoWidth, video.videoHeight));
    };

    update();
    // loadedmetadata for the first frame size, resize for the camera switching
    // orientation, the observer for the stage itself changing size.
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

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    // videoWidth stays 0 until the first frame arrives; capturing before that
    // writes a blank page.
    if (!video || !canvas || !stage || !video.videoWidth) return;

    // Measured now rather than taken from state, so a rotation between the
    // last layout and this tap cannot crop a stale rectangle. The guide comes
    // from where the frame shows on the stage, and the crop from mapping it
    // back through the video's object-fit: contain placement -- see
    // lib/cpms/scan-geometry.
    const { clientWidth, clientHeight } = stage;
    const crop = guideToFrameCrop(
      guideRect(clientWidth, clientHeight, video.videoWidth, video.videoHeight),
      clientWidth,
      clientHeight,
      video.videoWidth,
      video.videoHeight,
    );
    // The cropped region at the camera's own resolution. It is already 5:7,
    // so this copies pixels across without stretching them.
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
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-border">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close camera">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* The stage takes whatever height the header and controls leave, and
          the guide is laid out inside it -- so it can never reach either. */}
      <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // contain: the whole camera frame -- its full 1x field of view --
          // at its own aspect ratio, scaled uniformly, never stretched or
          // clipped. The guide is laid out on the part of the stage it covers.
          className="absolute inset-0 w-full h-full object-contain"
        />
        {guide && (
          <div
            className="absolute rounded-2xl border-2 border-dashed border-primary pointer-events-none"
            style={{
              left: guide.x,
              top: guide.y,
              width: guide.width,
              height: guide.height,
              // The mask: one shadow spread far past the stage, which clips
              // it. It darkens everything outside the guide, follows the
              // rounded corners, and leaves the inside untouched.
              boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.55)",
            }}
          >
            {CORNERS.map((corner) => (
              <span
                key={corner}
                aria-hidden="true"
                className={`absolute -m-[2px] h-7 w-7 border-primary ${corner}`}
              />
            ))}
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border space-y-3">
        <div className="text-center">
          <p className="text-sm font-medium">{instruction}</p>
          <p className="text-xs text-muted-foreground">
            Keep the document flat and fully visible for the best OCR result.
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={close}>
            {multiple && captureCount > 0 ? "Done" : "Cancel"}
          </Button>
          <Button onClick={capturePhoto} className="gap-2" disabled={!guide}>
            <Camera className="h-4 w-4" />
            Capture
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DocumentCamera;

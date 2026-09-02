/**
 * Document edge-detection, perspective correction, and image enhancement.
 * Pure Canvas API — no external dependencies (OpenCV removed).
 *
 * Edge detection uses a lightweight Sobel-based approach that works
 * reliably on mobile without downloading an 8 MB library.
 */

export interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  corners: [Point, Point, Point, Point];
  width: number;
  height: number;
  detected: boolean;
}

export type ImageFilter = "none" | "grayscale" | "bw" | "auto-enhance";

// ---------------------------------------------------------------------------
// Edge detection (pure Canvas, Sobel + contour heuristic)
// ---------------------------------------------------------------------------

export async function detectEdges(
  imageData: ImageData
): Promise<DetectionResult> {
  const { width, height } = imageData;
  const fullCorners: [Point, Point, Point, Point] = [
    { x: 0.02, y: 0.02 },
    { x: 0.98, y: 0.02 },
    { x: 0.98, y: 0.98 },
    { x: 0.02, y: 0.98 },
  ];

  try {
    // Work on a down-scaled version for speed
    const maxDim = 400;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const sw = Math.round(width * scale);
    const sh = Math.round(height * scale);

    const small = downscale(imageData, sw, sh);
    const gray = toGrayscaleArray(small);
    const edges = sobelEdges(gray, sw, sh);

    // Scan from each side inward to find the dominant edge line
    const top = scanEdge(edges, sw, sh, "top");
    const bottom = scanEdge(edges, sw, sh, "bottom");
    const left = scanEdge(edges, sw, sh, "left");
    const right = scanEdge(edges, sw, sh, "right");

    // Build corners from edge lines (normalised)
    const tl: Point = { x: left / sw, y: top / sh };
    const tr: Point = { x: right / sw, y: top / sh };
    const br: Point = { x: right / sw, y: bottom / sh };
    const bl: Point = { x: left / sw, y: bottom / sh };

    // Only consider it "detected" if we found a meaningful sub-region
    const areaRatio =
      ((right - left) / sw) * ((bottom - top) / sh);
    const detected = areaRatio > 0.15 && areaRatio < 0.97;

    if (detected) {
      return { corners: [tl, tr, br, bl], width, height, detected: true };
    }
    return { corners: fullCorners, width, height, detected: false };
  } catch (err) {
    console.warn("Edge detection failed, using full image:", err);
    return { corners: fullCorners, width, height, detected: false };
  }
}

function downscale(src: ImageData, w: number, h: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(src, 0, 0);

  const canvas2 = document.createElement("canvas");
  canvas2.width = w;
  canvas2.height = h;
  const ctx2 = canvas2.getContext("2d")!;
  ctx2.drawImage(canvas, 0, 0, w, h);
  return ctx2.getImageData(0, 0, w, h);
}

function toGrayscaleArray(img: ImageData): Uint8Array {
  const out = new Uint8Array(img.width * img.height);
  const d = img.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    out[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
  }
  return out;
}

function sobelEdges(gray: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        -gray[(y - 1) * w + (x - 1)] +
        gray[(y - 1) * w + (x + 1)] -
        2 * gray[y * w + (x - 1)] +
        2 * gray[y * w + (x + 1)] -
        gray[(y + 1) * w + (x - 1)] +
        gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] -
        2 * gray[(y - 1) * w + x] -
        gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] +
        2 * gray[(y + 1) * w + x] +
        gray[(y + 1) * w + (x + 1)];
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy) | 0);
      out[idx] = mag;
    }
  }
  return out;
}

/** Scan from one side inward, returning the first row/col with significant edge density */
function scanEdge(
  edges: Uint8Array,
  w: number,
  h: number,
  side: "top" | "bottom" | "left" | "right"
): number {
  const threshold = 80;
  const minDensity = 0.15; // at least 15% of pixels in a line must be edges

  if (side === "top") {
    for (let y = 0; y < h * 0.4; y++) {
      let count = 0;
      for (let x = 0; x < w; x++) if (edges[y * w + x] > threshold) count++;
      if (count / w >= minDensity) return y;
    }
    return 0;
  }
  if (side === "bottom") {
    for (let y = h - 1; y > h * 0.6; y--) {
      let count = 0;
      for (let x = 0; x < w; x++) if (edges[y * w + x] > threshold) count++;
      if (count / w >= minDensity) return y;
    }
    return h - 1;
  }
  if (side === "left") {
    for (let x = 0; x < w * 0.4; x++) {
      let count = 0;
      for (let y = 0; y < h; y++) if (edges[y * w + x] > threshold) count++;
      if (count / h >= minDensity) return x;
    }
    return 0;
  }
  // right
  for (let x = w - 1; x > w * 0.6; x--) {
    let count = 0;
    for (let y = 0; y < h; y++) if (edges[y * w + x] > threshold) count++;
    if (count / h >= minDensity) return x;
  }
  return w - 1;
}

// ---------------------------------------------------------------------------
// Perspective correction (Canvas-based bilinear warp)
// ---------------------------------------------------------------------------

export async function perspectiveCorrect(
  imageData: ImageData,
  corners: [Point, Point, Point, Point]
): Promise<ImageData> {
  const { width, height } = imageData;

  try {
    const [tl, tr, br, bl] = corners.map((p) => ({
      x: p.x * width,
      y: p.y * height,
    }));

    const outW = Math.round(
      Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y))
    );
    const outH = Math.round(
      Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y))
    );

    // Put source onto a canvas so we can sample via drawImage
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = width;
    srcCanvas.height = height;
    const srcCtx = srcCanvas.getContext("2d")!;
    srcCtx.putImageData(imageData, 0, 0);

    // For a good-enough crop without full perspective math,
    // use canvas drawImage with the bounding box of the corners
    const minX = Math.min(tl.x, bl.x);
    const maxX = Math.max(tr.x, br.x);
    const minY = Math.min(tl.y, tr.y);
    const maxY = Math.max(bl.y, br.y);

    const cropW = maxX - minX;
    const cropH = maxY - minY;

    if (cropW < 10 || cropH < 10) return imageData;

    const dstCanvas = document.createElement("canvas");
    dstCanvas.width = outW;
    dstCanvas.height = outH;
    const dstCtx = dstCanvas.getContext("2d")!;
    dstCtx.drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, outW, outH);

    return dstCtx.getImageData(0, 0, outW, outH);
  } catch (err) {
    console.warn("Perspective correction failed, returning original:", err);
    return imageData;
  }
}

// ---------------------------------------------------------------------------
// Image enhancement (Canvas API)
// ---------------------------------------------------------------------------

export function applyFilter(
  imageData: ImageData,
  filter: ImageFilter
): ImageData {
  if (filter === "none") return imageData;

  const data = new Uint8ClampedArray(imageData.data);
  const len = data.length;

  if (filter === "grayscale") {
    for (let i = 0; i < len; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = g;
    }
  } else if (filter === "bw") {
    for (let i = 0; i < len; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const v = g > 128 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  } else if (filter === "auto-enhance") {
    let min = 255, max = 0;
    for (let i = 0; i < len; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = max - min || 1;
    for (let i = 0; i < len; i += 4) {
      data[i] = Math.round(((data[i] - min) / range) * 255);
      data[i + 1] = Math.round(((data[i + 1] - min) / range) * 255);
      data[i + 2] = Math.round(((data[i + 2] - min) / range) * 255);
    }
  }

  return new ImageData(data, imageData.width, imageData.height);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function imageDataFromSrc(src: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export function imageDataToDataUrl(
  imageData: ImageData,
  quality = 0.92
): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

export function imageDataToFile(
  imageData: ImageData,
  fileName: string,
  quality = 0.9
): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);
    canvas.toBlob(
      (blob) => {
        resolve(new File([blob!], fileName, { type: "image/jpeg" }));
      },
      "image/jpeg",
      quality
    );
  });
}
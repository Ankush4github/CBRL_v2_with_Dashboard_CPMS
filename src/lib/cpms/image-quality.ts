/**
 * A quick look at a prescription photo before it costs a model call.
 *
 * Two checks, both on a small grayscale copy:
 *  - dark:   mean brightness. A photo taken in poor light reads as noise.
 *  - blurry: variance of the Laplacian (a standard focus measure). Text on a
 *            sharp photo has hard edges and a high variance; a shaken or
 *            out-of-focus one has soft edges and a low one.
 *
 * Advisory only. The thresholds are deliberately loose -- a warning that fires
 * on good photos teaches staff to ignore it -- and nothing is ever blocked.
 */

export interface ImageQuality {
  /** Mean luminance, 0-255. */
  brightness: number;
  /** Variance of the Laplacian over the sampled image. */
  sharpness: number;
  dark: boolean;
  blurry: boolean;
}

/** Long edge of the copy the checks run on: fast, and scale-independent enough. */
const SAMPLE_EDGE = 512;
export const DARK_BELOW = 60;
// Calibrated on synthetic 512px pages: sharp text scores ~5,900 (sparse,
// handwriting-like) to ~30,000 (dense print), so 60 sits two orders of
// magnitude below any sharp photo. Blurred sparse handwriting scores 16-28 and
// is caught; heavily blurred dense print (~73) is not -- the measure grows with
// ink density, and a loose miss beats a warning that cries wolf.
export const BLURRY_BELOW = 60;

/** The checks on raw grayscale pixels (row-major, one byte per pixel). */
export function assessGray(gray: ArrayLike<number>, width: number, height: number): ImageQuality {
  let sum = 0;
  for (let i = 0; i < width * height; i++) sum += gray[i];
  const brightness = width * height ? sum / (width * height) : 0;

  // 4-neighbour Laplacian over the interior.
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      // Welford's running variance: one pass, no second buffer.
      n++;
      const delta = lap - mean;
      mean += delta / n;
      m2 += delta * (lap - mean);
    }
  }
  const sharpness = n > 1 ? m2 / (n - 1) : 0;

  return {
    brightness,
    sharpness,
    dark: brightness < DARK_BELOW,
    // A near-black photo has no edges either; call that dark, not blurry.
    blurry: brightness >= DARK_BELOW && sharpness < BLURRY_BELOW,
  };
}

/** Load an image URL and run the checks. Null if it can't be decoded. */
export async function assessImageQuality(src: string): Promise<ImageQuality | null> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = src;
    });

    const scale = Math.min(1, SAMPLE_EDGE / Math.max(image.width, image.height));
    const width = Math.max(3, Math.round(image.width * scale));
    const height = Math.max(3, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);

    const { data } = ctx.getImageData(0, 0, width, height);
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
    return assessGray(gray, width, height);
  } catch {
    // A check that cannot run says nothing; the scan carries on.
    return null;
  }
}

/** The one-line warning for a result, or null when the photo looks fine. */
export function qualityWarning(quality: ImageQuality | null): string | null {
  if (!quality) return null;
  if (quality.dark) return "This photo looks too dark. The AI may misread it — retake it in better light if you can.";
  if (quality.blurry) return "This photo looks blurry. The AI may misread it — retake it holding the camera steady if you can.";
  return null;
}

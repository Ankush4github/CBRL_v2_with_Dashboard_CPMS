/**
 * Geometry for the document viewfinder (components/cpms/DocumentCamera.tsx).
 *
 * Two coordinate systems are in play, and keeping them apart is the point:
 *
 *   stage  CSS pixels of the box the <video> sits in on screen. The guide is
 *          laid out here.
 *   frame  pixels of the camera frame itself (video.videoWidth/Height). The
 *          crop is cut here, because that is what drawImage reads.
 *
 * The video is shown with `object-fit: contain`: the whole camera frame,
 * scaled uniformly until it just fits the stage and centred, with nothing cut
 * off. That is the camera's full 1x field of view -- `cover` filled the stage
 * by clipping the frame's edges, which read as zoomed in. The guide is placed
 * inside the part of the stage the frame actually covers, so it never sits
 * over the bars either side.
 *
 * A stage point maps to a frame point by one scale and one offset, the same on
 * both axes, so a 5:7 guide on screen becomes an exact 5:7 crop of the frame
 * with nothing stretched. devicePixelRatio does not enter into it: the guide is
 * in CSS pixels, the crop in frame pixels, and the mapping goes directly from
 * one to the other without ever passing through device pixels.
 *
 * Pure, so scripts/test-scan-logic.mts can check the mapping round-trips.
 */

/** Portrait 5:7 — a sheet a shade wider than A4's 1:1.41. */
export const SCAN_ASPECT = 5 / 7;
/** The guide's share of the visible frame, at most, on each axis. */
const MAX_WIDTH_SHARE = 0.86;
const MAX_HEIGHT_SHARE = 0.9;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How `object-fit: contain` places the frame in the stage: frame px → stage px. */
export function containTransform(
  stageWidth: number,
  stageHeight: number,
  frameWidth: number,
  frameHeight: number
) {
  const scale = Math.min(stageWidth / frameWidth, stageHeight / frameHeight);
  return {
    scale,
    // Zero on one axis, positive on the other: the bars either side.
    offsetX: (stageWidth - frameWidth * scale) / 2,
    offsetY: (stageHeight - frameHeight * scale) / 2,
  };
}

/** Where the camera frame shows on the stage, in stage pixels. */
export function visibleFrame(
  stageWidth: number,
  stageHeight: number,
  frameWidth: number,
  frameHeight: number
): Rect {
  const { scale, offsetX, offsetY } = containTransform(stageWidth, stageHeight, frameWidth, frameHeight);
  return { x: offsetX, y: offsetY, width: frameWidth * scale, height: frameHeight * scale };
}

/**
 * The scan guide, in stage pixels: the largest 5:7 rectangle no wider than 86%
 * and no taller than 90% of the visible frame, centred on it. A portrait
 * camera frame on a portrait phone is limited by width; a landscape frame, or
 * a short viewport, by height. Either way it sits wholly on the picture.
 */
export function guideRect(
  stageWidth: number,
  stageHeight: number,
  frameWidth: number,
  frameHeight: number
): Rect {
  const area = visibleFrame(stageWidth, stageHeight, frameWidth, frameHeight);
  let width = area.width * MAX_WIDTH_SHARE;
  let height = width / SCAN_ASPECT;
  const maxHeight = area.height * MAX_HEIGHT_SHARE;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * SCAN_ASPECT;
  }
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
    height,
  };
}

/**
 * The part of the camera frame that shows inside `guide`, in frame pixels.
 *
 * Clamped to the frame as a guard; a guide from guideRect is always inside
 * the visible frame, so it never needs it.
 */
export function guideToFrameCrop(
  guide: Rect,
  stageWidth: number,
  stageHeight: number,
  frameWidth: number,
  frameHeight: number
): Rect {
  const { scale, offsetX, offsetY } = containTransform(stageWidth, stageHeight, frameWidth, frameHeight);
  const x = Math.max(0, (guide.x - offsetX) / scale);
  const y = Math.max(0, (guide.y - offsetY) / scale);
  const right = Math.min(frameWidth, (guide.x + guide.width - offsetX) / scale);
  const bottom = Math.min(frameHeight, (guide.y + guide.height - offsetY) / scale);
  return { x, y, width: right - x, height: bottom - y };
}

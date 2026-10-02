/**
 * Geometry for the document viewfinder (components/cpms/DocumentCamera.tsx).
 *
 * Two coordinate systems are in play, and keeping them apart is the point:
 *
 *   stage  CSS pixels of the box the <video> fills on screen. The guide is
 *          laid out here.
 *   frame  pixels of the camera frame itself (video.videoWidth/Height). The
 *          crop is cut here, because that is what drawImage reads.
 *
 * The video is shown with `object-fit: cover`: scaled uniformly until it fills
 * the stage, centred, and the overflow clipped. A stage point therefore maps
 * to a frame point by one scale and one offset, the same on both axes, so a
 * 5:7 guide on screen becomes an exact 5:7 crop of the frame with nothing
 * stretched. devicePixelRatio does not enter into it: the guide is in CSS
 * pixels, the crop in frame pixels, and the mapping goes directly from one to
 * the other without ever passing through device pixels.
 *
 * Pure, so scripts/test-scan-logic.mts can check the mapping round-trips.
 */

/** Portrait 5:7 — a sheet a shade wider than A4's 1:1.41. */
export const SCAN_ASPECT = 5 / 7;
/** The guide's share of the stage, at most, on each axis. */
const MAX_WIDTH_SHARE = 0.86;
const MAX_HEIGHT_SHARE = 0.9;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The scan guide: the largest centred 5:7 rectangle no wider than 86% and no
 * taller than 90% of the stage. Portrait phones are limited by width, short or
 * landscape viewports by height; either way it sits wholly inside the stage.
 */
export function guideRect(stageWidth: number, stageHeight: number): Rect {
  let width = stageWidth * MAX_WIDTH_SHARE;
  let height = width / SCAN_ASPECT;
  const maxHeight = stageHeight * MAX_HEIGHT_SHARE;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * SCAN_ASPECT;
  }
  return { x: (stageWidth - width) / 2, y: (stageHeight - height) / 2, width, height };
}

/** How `object-fit: cover` places the frame in the stage: frame px → stage px. */
export function coverTransform(
  stageWidth: number,
  stageHeight: number,
  frameWidth: number,
  frameHeight: number
) {
  const scale = Math.max(stageWidth / frameWidth, stageHeight / frameHeight);
  return {
    scale,
    // Negative on the clipped axis: the frame overhangs the stage there.
    offsetX: (stageWidth - frameWidth * scale) / 2,
    offsetY: (stageHeight - frameHeight * scale) / 2,
  };
}

/**
 * The part of the camera frame that shows inside `guide`, in frame pixels.
 *
 * Clamped to the frame as a guard; with `cover` the whole stage is covered by
 * the frame, so a guide inside the stage never needs it.
 */
export function guideToFrameCrop(
  guide: Rect,
  stageWidth: number,
  stageHeight: number,
  frameWidth: number,
  frameHeight: number
): Rect {
  const { scale, offsetX, offsetY } = coverTransform(stageWidth, stageHeight, frameWidth, frameHeight);
  const x = Math.max(0, (guide.x - offsetX) / scale);
  const y = Math.max(0, (guide.y - offsetY) / scale);
  const right = Math.min(frameWidth, (guide.x + guide.width - offsetX) / scale);
  const bottom = Math.min(frameHeight, (guide.y + guide.height - offsetY) / scale);
  return { x, y, width: right - x, height: bottom - y };
}

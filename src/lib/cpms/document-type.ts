/**
 * What a stored document actually is, read from its first bytes.
 *
 * Previews render a downloaded blob through an object URL, and a blob: URL
 * runs on CPMS's own origin. The blob's type comes from the Content-Type the
 * object was uploaded with, and the preview picks iframe-or-img from the
 * document's *name* — both set by whoever uploaded it. An HTML file stored as
 * "Lab report.pdf" would therefore open in the preview iframe as a same-origin
 * page, scripts and all, in the session of the admin who clicked it.
 *
 * So neither is believed. The magic bytes decide the type, the blob is rebuilt
 * with that type, and anything that is not one of the three formats CPMS ever
 * uploads is refused rather than rendered.
 */

export type DocumentKind = 'pdf' | 'jpeg' | 'png';

const MIME: Record<DocumentKind, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function sniff(bytes: Uint8Array): DocumentKind | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  return null;
}

/**
 * The blob re-typed from its contents, or null when it is not a PDF, JPEG or
 * PNG. Only the result of this may be handed to a preview.
 */
export async function toPreviewableBlob(
  blob: Blob
): Promise<{ blob: Blob; kind: DocumentKind } | null> {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const kind = sniff(head);
  if (!kind) return null;
  return { blob: new Blob([blob], { type: MIME[kind] }), kind };
}

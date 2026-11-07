export type RasterFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'avif';

/**
 * The raster format these bytes are, by magic number, or null.
 *
 * The upload route checks this before sharp sees a file. sharp chooses its
 * decoder from the bytes, not from the declared Content-Type, so without this
 * an SVG, PDF or TIFF labelled `image/png` would still reach librsvg, poppler
 * or libtiff. Only the five formats the route accepts get through.
 */
export function sniffRasterFormat(bytes: Uint8Array): RasterFormat | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';

  // AVIF is an ISO-BMFF file: a 4-byte box size, `ftyp`, the major brand, a
  // minor version, then compatible brands up to the end of the box. Some
  // encoders put `mif1` first and list `avif` among the compatible brands.
  if (bytes.length >= 16 && ascii(4, 8) === 'ftyp') {
    const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const end = Math.min(boxSize, bytes.length, 256);
    const brands = [ascii(8, 12)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(i, i + 4));
    if (brands.includes('avif') || brands.includes('avis')) return 'avif';
  }

  return null;
}

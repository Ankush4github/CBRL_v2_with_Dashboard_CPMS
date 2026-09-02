/**
 * The site's public origin, and how to turn a content asset path into an
 * absolute URL.
 *
 * Structured data and social cards have to carry absolute URLs. Asset paths in
 * the content collections come in two shapes — a site-relative `/images/…` for
 * the files committed under `public/`, and an absolute `site-media` bucket URL
 * for anything uploaded from the dashboard (see assetPath() in
 * ./content-schema). Prefixing unconditionally therefore breaks the moment an
 * editor replaces a photo, producing `https://cbrl.iitkgp.ac.inhttps://…`.
 *
 * Client-safe: no Node imports, so JSON-LD builders on either side of the
 * server/client line can use it.
 */

export const SITE_URL = 'https://cbrl.iitkgp.ac.in';

/** Absolute URL for a content asset path, whichever of the two shapes it is in. */
export function absoluteAsset(path: string): string {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : `${SITE_URL}${path}`;
}

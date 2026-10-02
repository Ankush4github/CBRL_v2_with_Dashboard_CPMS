import { MetadataRoute } from 'next';

import { getAllMembers, getCollectionUpdatedAt, getGallery } from '@/lib/content';
import { absoluteAsset, SITE_URL } from '@/lib/site-url';

/**
 * Each public page, the content collections it is built from, and the date to
 * fall back on.
 *
 * `lastmod` is the newest dashboard save among a page's collections, read from
 * site_content.updated_at — so a page's date moves when its own content
 * changes, and only then. Crawlers learn to ignore a lastmod that moves on
 * every deploy, and equally one that never moves. The fixed date is used only
 * when the database cannot be read, and for /contact, which no collection
 * feeds; bump it when that page's code changes.
 *
 * changefreq and priority are deliberately omitted: Google ignores both
 * outright, so they only add noise a maintainer has to keep plausible.
 *
 * The collections mirror DEPENDENT_PATHS in src/lib/content.ts (plus the two
 * BibTeX-backed ones, publications and metrics); keep the two in step.
 */
const routes: { path: string; collections: string[]; fallback: string }[] = [
  { path: '', collections: ['home'], fallback: '2026-07-21' },
  { path: '/about-the-pi', collections: ['about', 'publications'], fallback: '2026-07-21' },
  { path: '/research', collections: ['research'], fallback: '2026-07-21' },
  { path: '/projects', collections: ['projects'], fallback: '2026-07-21' },
  { path: '/publications', collections: ['publications', 'metrics'], fallback: '2026-07-21' },
  { path: '/facilities', collections: ['facilities', 'members'], fallback: '2026-07-21' },
  { path: '/members', collections: ['members'], fallback: '2026-07-21' },
  { path: '/gallery', collections: ['gallery'], fallback: '2026-07-21' },
  { path: '/contact', collections: [], fallback: '2026-07-21' },
];

/**
 * Image URLs for a page, for Google Images. The gallery and the members page
 * are mostly photographs, and an image listed here is found even where the
 * page only reveals it in a lightbox or on a card flip. Absolute, de-duplicated,
 * and capped well under the 1,000-per-URL limit.
 */
async function pageImages(path: string): Promise<string[] | undefined> {
  let paths: (string | undefined)[] = [];
  try {
    if (path === '/gallery') {
      const { albums } = await getGallery();
      paths = albums.flatMap((album) => [album.image, ...(album.images ?? [])]);
    } else if (path === '/members') {
      paths = (await getAllMembers()).map((member) => member.image);
    } else {
      return undefined;
    }
  } catch {
    // Content unreadable: the page is still listed, just without its images.
    return undefined;
  }
  const urls = [...new Set(paths.filter((p): p is string => Boolean(p)).map(absoluteAsset))];
  return urls.length ? urls.slice(0, 500) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updated = await getCollectionUpdatedAt();

  return Promise.all(
    routes.map(async ({ path, collections, fallback }) => {
      const saved = collections
        .map((c) => updated.get(c))
        .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
      const lastModified = saved.length
        ? new Date(Math.max(...saved.map((d) => d.getTime())))
        : new Date(fallback);
      const images = await pageImages(path);
      return {
        url: `${SITE_URL}${path}`,
        lastModified,
        ...(images ? { images } : {}),
      };
    })
  );
}

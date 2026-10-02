import { MetadataRoute } from 'next';

import { getCollectionUpdatedAt, getMembers } from '@/lib/content';
import { profileMembers, profilePath } from '@/lib/member-profile';
import { SITE_URL } from '@/lib/site-url';

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
 * outright, so they only add noise a maintainer has to keep plausible. So are
 * image entries: the pages themselves carry the images, with their alt text
 * and structured data, which is what Google Images reads.
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

/** The members collection's last save, or the fixed fallback. */
function membersDate(updated: Map<string, Date>): Date {
  const saved = updated.get('members');
  return saved && !Number.isNaN(saved.getTime()) ? saved : new Date('2026-07-21');
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updated = await getCollectionUpdatedAt();

  // One URL per member profile, so a search for a member's name can find a
  // page about that person. The PI's profile is /about-the-pi, already above.
  let profiles: MetadataRoute.Sitemap = [];
  try {
    profiles = profileMembers(await getMembers()).map(({ member, group }) => ({
      url: `${SITE_URL}${profilePath(member, group)}`,
      lastModified: membersDate(updated),
    }));
  } catch {
    // Members unreadable: the sitemap still lists the main pages.
  }

  const pages = routes.map(({ path, collections, fallback }) => {
    const saved = collections
      .map((c) => updated.get(c))
      .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
    const lastModified = saved.length
      ? new Date(Math.max(...saved.map((d) => d.getTime())))
      : new Date(fallback);
    return { url: `${SITE_URL}${path}`, lastModified };
  });

  return [...pages, ...profiles];
}

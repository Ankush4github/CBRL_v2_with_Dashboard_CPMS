/**
 * Server-side access to the editable website content.
 *
 * Content lives in the `site_content` table of the Supabase project shared with
 * CPMS. It used to live in `content/*.json` on the server's disk, which tied it
 * to the deployment artifact: those files are tracked in git, so a deploy
 * overwrote anything the dashboard had saved since the last commit, and
 * uploaded images landed in a directory the next release replaced.
 *
 * Reads go through the publishable key with no session — `site_content` is
 * world-readable because the site it renders is public — so pages stay
 * statically generated. Writes go through the *editor's own* session, and the
 * `is_site_editor()` check in the table's RLS policy is what authorises them.
 * There is no service-role key in this application; see ./supabase/config.
 *
 * The JSON files remain on disk as a build-time fallback (see `fromDisk`).
 *
 * Server-only — never import this from a `'use client'` module. Client code
 * wanting the shapes should import `./content-types`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import { revalidatePath } from 'next/cache';

import {
  isContentCollection,
  type AboutContent,
  type ContentCollection,
  type ContentMap,
  type FacilitiesContent,
  type GalleryContent,
  type HomeContent,
  type MembersContent,
  type MetricsContent,
  type ProjectsContent,
  type ResearchContent,
} from './content-types';
import type { Json, TablesInsert } from '@shared/supabase-types';
import { createClient } from './supabase/server';
import { publicSupabase } from './supabase/public';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public', 'data');

/** Pages whose render depends on each collection. */
const DEPENDENT_PATHS: Record<ContentCollection, string[]> = {
  home: ['/'],
  members: ['/members', '/facilities'],
  projects: ['/projects'],
  research: ['/research'],
  gallery: ['/gallery'],
  facilities: ['/facilities'],
  about: ['/about-the-pi'],
};

/* ------------------------------------------------------------- disk fallback */

/**
 * Where each collection's last committed copy sits on disk.
 *
 * These files are no longer the source of truth, but they are still the seed
 * the database was migrated from, and they are what the build falls back to.
 */
function diskFile(collection: string): string {
  if (collection === 'metrics') return path.join(PUBLIC_DATA_DIR, 'metrics.json');
  if (collection === 'publications') return path.join(PUBLIC_DATA_DIR, 'publications.bib');
  if (!isContentCollection(collection)) {
    throw new Error(`unknown content collection: ${String(collection)}`);
  }
  return path.join(CONTENT_DIR, `${collection}.json`);
}

/**
 * Last resort when the database cannot be reached.
 *
 * Supabase projects on the free tier pause after a period of inactivity, and a
 * network blip during a deploy should not be able to fail the build or render
 * an empty site. The trade-off is explicit: this copy is only as fresh as the
 * last commit, so it is logged loudly rather than swallowed — a page rendered
 * from here may be showing content the dashboard has since changed.
 */
async function fromDisk<T>(collection: string, parse: boolean): Promise<T> {
  const raw = await fs.readFile(diskFile(collection), 'utf8');
  return (parse ? JSON.parse(raw) : raw) as T;
}

/**
 * Two different reasons end up on disk, and conflating them sends people to
 * debug the wrong thing. "No row" is the expected state before the migration
 * has run and is fixed by a command; a read failure is an actual outage.
 */
/**
 * Both warnings below fire on every render of every page that reads the
 * collection, which in dev means once per Fast Refresh — enough noise to bury
 * whatever you were actually looking at. Neither message changes between
 * occurrences, so one per collection per process is all it is worth.
 */
const warned = new Set<string>();

function warnOnce(key: string, log: () => void): void {
  if (warned.has(key)) return;
  warned.add(key);
  log();
}

function warnNotMigrated(collection: string): void {
  warnOnce(`missing:${collection}`, () =>
    console.warn(
      `[content] "${collection}" has no row in site_content yet — serving the committed copy ` +
        `from disk. Run \`npm run migrate:content\` to move it into the database. ` +
        `(Saving this collection from the dashboard also creates the row.)`
    )
  );
}

function warnUnreadable(collection: string, reason: unknown): void {
  warnOnce(`unreadable:${collection}`, () =>
    console.warn(
      `[content] Could not read "${collection}" from the database — falling back to the ` +
        `committed copy on disk, which is only current as of the last commit. Reason:`,
      reason
    )
  );
}

/**
 * One row's payload, or null when the collection has not been migrated.
 *
 * Throws only on a genuine read failure, so callers can tell the two apart.
 */
async function fetchRow<T>(collection: string, column: 'data' | 'raw'): Promise<T | null> {
  const { data, error } = await publicSupabase
    .from('site_content')
    .select(column)
    .eq('collection', collection)
    .maybeSingle();

  if (error) throw error;
  return ((data as Record<string, unknown> | null)?.[column] as T) ?? null;
}

/**
 * Thrown by the *ForEdit readers when the database cannot be read.
 *
 * The public site falls back to disk on a read failure; the dashboard must not.
 * An editor seeded from the committed copy saves the whole document back, which
 * silently replaces every dashboard edit made since that commit. Refusing to
 * open the editor is the safe answer — "try again" costs nothing, a revert
 * through site_content_versions does.
 */
export class ContentUnavailableError extends Error {
  constructor(collection: string, options?: { cause?: unknown }) {
    super(
      `Could not load "${collection}" from the database. Nothing was changed — ` +
        `try again in a moment.`,
      options
    );
    this.name = 'ContentUnavailableError';
  }
}

/**
 * The dashboard's read: the database row, or the disk seed only when the
 * collection has never been migrated (there is then nothing newer to lose).
 */
async function readForEdit<T>(
  collection: string,
  column: 'data' | 'raw',
  parse: boolean
): Promise<T> {
  let row: T | null;
  try {
    row = await fetchRow<T>(collection, column);
  } catch (reason) {
    console.error(`[content] Refusing to edit "${collection}": database read failed.`, reason);
    throw new ContentUnavailableError(collection, { cause: reason });
  }
  if (row !== null) return row;
  warnNotMigrated(collection);
  return fromDisk<T>(collection, parse);
}

export function readContentForEdit<K extends ContentCollection>(
  collection: K
): Promise<ContentMap[K]> {
  if (!isContentCollection(collection)) {
    throw new Error(`unknown content collection: ${String(collection)}`);
  }
  return readForEdit<ContentMap[K]>(collection, 'data', true);
}

export async function getMetricsForEdit(): Promise<MetricsContent | null> {
  try {
    return await readForEdit<MetricsContent>('metrics', 'data', true);
  } catch (error) {
    if (error instanceof ContentUnavailableError) throw error;
    return null; // no row and no disk copy: nothing to edit yet
  }
}

export function readPublicationsForEdit(): Promise<string> {
  return readForEdit<string>('publications', 'raw', false);
}

/* --------------------------------------------------------------- reading */

/**
 * `cache()` dedupes within a single render — /members reads the same
 * collection from both the layout (JSON-LD) and the page.
 */
export const readContent = cache(
  async <K extends ContentCollection>(collection: K): Promise<ContentMap[K]> => {
    if (!isContentCollection(collection)) {
      throw new Error(`unknown content collection: ${String(collection)}`);
    }

    try {
      const row = await fetchRow<ContentMap[K]>(collection, 'data');
      if (row) return row;
      warnNotMigrated(collection);
    } catch (reason) {
      warnUnreadable(collection, reason);
    }
    return fromDisk<ContentMap[K]>(collection, true);
  }
);

export const getHome = (): Promise<HomeContent> => readContent('home');
export const getMembers = (): Promise<MembersContent> => readContent('members');
export const getProjects = (): Promise<ProjectsContent> => readContent('projects');
export const getResearch = (): Promise<ResearchContent> => readContent('research');
export const getGallery = (): Promise<GalleryContent> => readContent('gallery');
export const getFacilities = (): Promise<FacilitiesContent> => readContent('facilities');
export const getAbout = (): Promise<AboutContent> => readContent('about');

/** Every member across all groups, in display order. */
export async function getAllMembers() {
  const members = await getMembers();
  return [
    ...members.faculty,
    ...members.postdocs,
    ...members.students,
    ...members.staff,
    ...members.alumni,
  ];
}

/**
 * When any collection was last saved — the footer's "Last updated on" date.
 *
 * The newest `updated_at` across `site_content`, which the BEFORE UPDATE
 * trigger stamps on every dashboard save. Null when the database cannot be
 * read: the disk fallback carries no trustworthy date, and showing none beats
 * showing a wrong one.
 */
export const getLastUpdated = cache(async (): Promise<Date | null> => {
  try {
    const { data, error } = await publicSupabase
      .from('site_content')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? new Date(data.updated_at) : null;
  } catch (reason) {
    warnOnce('unreadable:updated_at', () =>
      console.warn('[content] Could not read the last-updated date; the footer omits it. Reason:', reason)
    );
    return null;
  }
});

/**
 * When each collection was last saved, keyed by collection name — the
 * sitemap's per-page `lastmod`.
 *
 * Every row, not just the newest: a page's date should move when *its*
 * content changes, not whenever anything on the site does. Empty when the
 * database cannot be read; the sitemap then falls back to its fixed dates.
 */
export const getCollectionUpdatedAt = cache(async (): Promise<Map<string, Date>> => {
  try {
    const { data, error } = await publicSupabase.from('site_content').select('collection, updated_at');
    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.collection, new Date(row.updated_at)]));
  } catch (reason) {
    warnOnce('unreadable:collection-dates', () =>
      console.warn('[content] Could not read per-collection dates; the sitemap uses its fixed ones. Reason:', reason)
    );
    return new Map();
  }
});

/* --------------------------------------------------------------- writing */

/**
 * Save a collection.
 *
 * Uses the caller's session, so this only works from a route handler running
 * behind the admin proxy. RLS rejects it otherwise — which is the point: the
 * grant is checked by the database, not merely by the gate in front of it.
 *
 * The previous version of the row is snapshotted into `site_content_versions`
 * by a BEFORE UPDATE trigger, which also stamps `updated_at` / `updated_by`.
 * That replaces the rolling 20 files this function used to keep under
 * `content/.backups/`.
 */
async function save(
  collection: string,
  payload: { data: unknown } | { raw: string }
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Annotated rather than inferred: the spread below produces a union of two
  // shapes, and without a target type the overload resolves against whichever
  // branch it sees first and then rejects the other.
  const row: TablesInsert<'site_content'> = {
    collection,
    // The collection shapes in content-types.ts are `interface`s, and
    // TypeScript will not assign an interface to Json — interfaces get no
    // implicit index signature — even though these are structurally JSON and
    // came from JSON. The route handler has already validated the document
    // against the content schema before it reaches here, so this narrows an
    // unavoidable TypeScript limitation rather than papering over a real gap.
    ...('data' in payload ? { data: payload.data as Json } : { raw: payload.raw }),
    updated_by: user?.id ?? null,
  };

  const { error } = await supabase
    .from('site_content')
    .upsert(row, { onConflict: 'collection' });

  if (error) {
    // The raw PostgREST message names the table and the policy that refused the
    // write, so it stays in the server log and out of the thrown Error. Every
    // route that calls this already answers with its own generic message, and
    // building the detail into the Error only made that a matter of each caller
    // remembering to catch it.
    console.error(`Failed to save "${collection}":`, {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });
    // A row-level security refusal is the likely one, and worth naming — an
    // editor whose grant was revoked otherwise sees an unexplained failure.
    throw new Error(
      `Could not save "${collection}". If the account is no longer a site editor, ` +
        `that is the likely reason.`
    );
  }

  // Every public page's footer shows the last-updated date, so a save changes
  // all of them, not just the collection's DEPENDENT_PATHS.
  revalidatePath('/', 'layout');
  // The sitemap is a route of its own rather than a page under the layout,
  // and carries each page's lastmod, so it is refreshed too.
  revalidatePath('/sitemap.xml');
}

export async function writeContent<K extends ContentCollection>(
  collection: K,
  data: ContentMap[K]
): Promise<void> {
  await save(collection, { data });
  for (const p of DEPENDENT_PATHS[collection]) revalidatePath(p);
  // Every member's profile page is built from this collection too. A member
  // removed by this save then 404s, and one added is rendered on first visit.
  if (collection === 'members') revalidatePath('/members/[id]', 'page');
}

/* ------------------------------------------------------- citation metrics */

export const getMetrics = cache(async (): Promise<MetricsContent | null> => {
  try {
    const row = await fetchRow<MetricsContent>('metrics', 'data');
    if (row) return row;
    warnNotMigrated('metrics');
  } catch (reason) {
    warnUnreadable('metrics', reason);
  }

  try {
    return await fromDisk<MetricsContent>('metrics', true);
  } catch {
    // Metrics are supplementary — the publications page renders without them.
    return null;
  }
});

export async function writeMetrics(data: MetricsContent): Promise<void> {
  await save('metrics', { data });
  revalidatePath('/publications');
  revalidatePath('/about-the-pi');
}

/* ------------------------------------------------------------ publications */

export async function readPublicationsFile(): Promise<string> {
  try {
    const row = await fetchRow<string>('publications', 'raw');
    if (typeof row === 'string') return row;
    warnNotMigrated('publications');
  } catch (reason) {
    warnUnreadable('publications', reason);
  }
  return fromDisk<string>('publications', false);
}

export async function writePublicationsFile(bibtex: string): Promise<void> {
  await save('publications', { raw: bibtex });
  revalidatePath('/publications');
  revalidatePath('/about-the-pi');
  revalidatePath('/');
}

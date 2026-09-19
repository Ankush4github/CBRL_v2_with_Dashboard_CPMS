/**
 * Drop Next's persisted Data Cache before a production build.
 *
 * The public pages are statically prerendered and read their content from the
 * `site_content` table through `publicSupabase` (see src/lib/content.ts). That
 * read is an ordinary `fetch`, and Next patches `fetch` — so the response lands
 * in the Data Cache under `.next/cache/fetch-cache`.
 *
 * At *runtime* an unconfigured fetch is not cached, which is why the dashboard's
 * `revalidatePath` on save refreshes a page and why `npm run dev` always shows
 * the current database. During *build-time prerendering* Next deliberately does
 * the opposite — from its own source (server/lib/patch-fetch.js):
 *
 *     // We don't enable automatic no-cache behavior during build-time
 *     // prerendering so that we can still leverage the fetch cache between
 *     // export workers.
 *
 * The intent is to share one response between the workers of a single build.
 * The catch is where it is kept: `.next/cache/fetch-cache` is written "so it can
 * be persisted" (incremental-cache/file-system-cache.js) and the entries are
 * stored with a one-year lifetime and no build id. So the *next* build reads
 * them back and considers them fresh. Every build after the first one bakes in
 * whatever the database said the first time, and `npm start` serves that —
 * while `npm run dev`, which never prerenders, shows the real thing. That is the
 * whole shape of the bug this script exists to prevent.
 *
 * Deleting the directory is the surgical fix. The alternatives all cost more
 * than they are worth here: `cache: 'no-store'` or `revalidate: 0` on the read
 * would make Next mark the scope dynamic and turn every public page into a
 * per-request render, and a finite `revalidate` would turn them into ISR pages
 * that re-query Supabase on a timer. Neither is needed — the pages should be
 * static, and a build should simply read the database as it is at that moment.
 *
 * Only upstream HTTP responses live in this directory. The Turbopack compile
 * cache (`.next/cache/turbopack`) and the optimized-image cache
 * (`.next/cache/images`) are left alone, so builds stay as fast as they were.
 */

const fs = require('fs');
const path = require('path');

const FETCH_CACHE = path.join(__dirname, '..', '.next', 'cache', 'fetch-cache');

try {
  const entries = fs.readdirSync(FETCH_CACHE).length;
  fs.rmSync(FETCH_CACHE, { recursive: true, force: true });
  console.log(
    `[build] Cleared Next's Data Cache (${entries} cached response${entries === 1 ? '' : 's'}) — ` +
      `this build will read site content from Supabase, not from the last build.`
  );
} catch (error) {
  if (error.code === 'ENOENT') {
    // First build, or the cache was already cleared. Nothing to do.
    process.exit(0);
  }
  // Not fatal: a build against a stale cache is worse than a build that had to
  // warn, but it is still a build. Say plainly what may be wrong with it.
  console.warn(
    `[build] Could not clear ${FETCH_CACHE} — this build may prerender the site ` +
      `content that the previous build fetched. Reason:`,
    error.message
  );
}

/**
 * The path CPMS is mounted at within this app.
 *
 * This used to be Next's `basePath`, set from cpms-next/next.config.mjs when
 * CPMS was a separate Next process. Next applied it automatically to <Link>
 * hrefs, router.push() targets and /_next/* URLs, and `asset()` existed only to
 * cover the strings Next did *not* touch — files in public/, the service worker
 * registration URL, the OAuth redirect handed to Supabase.
 *
 * That distinction is gone. CPMS is now an ordinary route subtree at
 * src/app/cpms, so nothing is prefixed automatically and every internal path
 * goes through `asset()` — navigation included. The name is kept because the
 * call sites read the same either way, but treat it as "the mount path", not
 * as anything Next knows about.
 *
 * Hardcoded rather than read from the environment: NEXT_PUBLIC_BASE_PATH was
 * supplied by the CPMS config that no longer exists, and the value is not
 * deployment-specific — it is where the routes physically live on disk. Moving
 * the app means moving src/app/cpms and editing this line together.
 */
export const basePath = '/cpms';

/**
 * Prefixes a root-absolute path with the mount path.
 *
 *   asset('/cbrl-logo.png')  ->  '/cpms/cbrl-logo.png'   (public/cpms/…)
 *   asset('/dashboard')      ->  '/cpms/dashboard'       (a route)
 */
export function asset(path: string): string {
  return `${basePath}${path}`;
}

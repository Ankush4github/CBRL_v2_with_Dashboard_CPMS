/**
 * Connection details for the Supabase project shared with CPMS.
 *
 * The website holds the **publishable** key and nothing else. There is
 * deliberately no service-role key anywhere in this application, and adding one
 * would undo the security model rather than extend it:
 *
 * The same project stores patient records. What keeps a website content editor
 * away from them is row-level security — every clinical policy is gated on
 * `user_is_enabled()`, which is `COALESCE(..., false)` and therefore false for
 * an account that only has a `site_editors` grant. A service-role key bypasses
 * RLS completely, so a bug or an RCE in this app would turn into full access to
 * clinical data. With only the publishable key, the worst an attacker gains is
 * what an anonymous visitor already has: read access to public website content.
 *
 * Writes are authorised by the editor's own JWT, checked against
 * `is_site_editor()` by the policies on `site_content` and `storage.objects`.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** True when the dashboard has been pointed at a Supabase project at all. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

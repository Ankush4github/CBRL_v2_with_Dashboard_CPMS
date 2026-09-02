import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether this account may edit the website.
 *
 * Read from `site_editors` directly rather than through the `is_site_editor()`
 * RPC: the function's EXECUTE grant was narrowed to `authenticated` for the
 * policies' benefit, and depending on an RPC endpoint here would mean a future
 * tightening of that grant silently locks every editor out. The table's own
 * SELECT policy already lets an account see its own row.
 *
 * Note this is *not* the security boundary — RLS on `site_content` and
 * `storage.objects` is, and it re-checks the same grant on every write. This is
 * the gate that stops a signed-in non-editor from loading the dashboard at all.
 *
 * Fails closed: an unreachable database denies access rather than granting it.
 */
export async function isSiteEditor(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('site_editors')
      .select('user_id')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .maybeSingle();

    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

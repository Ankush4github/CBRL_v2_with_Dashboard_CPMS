import { createClient } from '@supabase/supabase-js';

import type { Database } from '@shared/supabase-types';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

/**
 * Session-less client for reading public website content.
 *
 * Deliberately *not* the cookie-bound server client. Reading `cookies()` opts
 * the calling route into dynamic rendering, and these reads happen from the
 * public pages — which are statically generated and revalidated on save. Going
 * through this client keeps them static.
 *
 * It reaches exactly what an anonymous visitor can reach: `site_content` has a
 * `using (true)` SELECT policy because the website it renders is public. It has
 * no session, so it satisfies no policy that tests `auth.uid()`, and every
 * clinical table in this project is behind one.
 */
export const publicSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Nothing here signs in, and a module-level client is shared across
    // requests on the server — persisting or refreshing a session would be
    // both pointless and a way to leak one request's identity into another's.
    persistSession: false,
    autoRefreshToken: false,
  },
});

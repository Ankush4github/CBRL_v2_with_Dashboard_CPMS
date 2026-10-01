/**
 * Supabase client for Server Components, Server Actions and route handlers.
 *
 * Server-only — it reads the request's cookies through `next/headers`. Client
 * components want `./browser` instead, and the proxy and the auth callback want
 * `./request`, which threads cookies through the request/response pair by hand.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '@shared/supabase-types';
import { COOKIE_ENCODING, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieEncoding: COOKIE_ENCODING,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. That is fine and expected:
          // the proxy runs on every request under /admin and refreshes the
          // session there, so a refresh attempted during a render is redundant
          // rather than lost.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null.
 *
 * `getUser()` rather than `getSession()`: the latter decodes the cookie and
 * believes it, while this revalidates the token against the auth server. The
 * cookie is attacker-supplied input, so nothing should trust it unverified.
 */
export async function getSignedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

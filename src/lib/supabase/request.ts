/**
 * Supabase client bound to an explicit request/response pair.
 *
 * Used by the proxy and by the OAuth callback — both build their own
 * `NextResponse` and cannot rely on `next/headers`. Auth cookies (including a
 * rotated refresh token) are written straight onto the response handed in, so
 * **the response returned to Next must be the same object passed here**.
 * Constructing a fresh `NextResponse` afterwards silently drops the rotation
 * and signs the editor out part-way through their session.
 */

import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

import type { Database } from '@shared/supabase-types';
import { COOKIE_ENCODING, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export function createRequestClient(request: NextRequest, response: NextResponse) {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieEncoding: COOKIE_ENCODING,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}

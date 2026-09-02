'use client';

/**
 * Supabase client for client components — the login screen's Google button and
 * the sign-out control.
 *
 * `createBrowserClient` memoises internally, so calling this per render is
 * cheap and does not spawn a new client each time.
 */

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@shared/supabase-types';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

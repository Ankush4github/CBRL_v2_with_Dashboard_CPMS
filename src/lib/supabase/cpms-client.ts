import { createClient } from '@supabase/supabase-js';
import type { Database } from '@shared/supabase-types';

// Vite exposed these as import.meta.env.VITE_*; Next uses process.env.NEXT_PUBLIC_*.
// Both are inlined into the client bundle at build time and are public by design —
// Row Level Security is what protects the data.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/cpms-client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // The Vite build passed `localStorage` directly. That is a bare global, so
    // under Next it would throw ReferenceError the moment this module is
    // evaluated on the server during build or prerender. Resolving it lazily
    // keeps the exact same browser behaviour (persisted localStorage sessions)
    // while staying importable on the server.
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    // PKCE rather than supabase-js's default implicit flow: Google sign-in
    // comes back with a one-time ?code= that is useless without the verifier
    // this browser stored when sign-in began, instead of the access and
    // refresh tokens themselves riding in the URL fragment of /cpms/dashboard.
    flowType: 'pkce',
  },
});

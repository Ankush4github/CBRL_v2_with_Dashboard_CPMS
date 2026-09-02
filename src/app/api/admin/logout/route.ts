import { NextResponse, type NextRequest } from 'next/server';

import { sessionCookie } from '@/lib/admin-auth';
import { createRequestClient } from '@/lib/supabase/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });

  // `scope: 'local'` clears this browser's session without revoking the
  // account's refresh tokens server-side. The default, 'global', would sign the
  // same account out of every session it has anywhere — including CPMS at
  // /cpms, which is the same origin and the same Supabase project. Signing out
  // of the website dashboard should not eject a clinician from the patient
  // system mid-shift.
  const supabase = createRequestClient(request, response);
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {
    // Already gone, or Supabase unreachable. The cookies below are cleared
    // either way, so the browser ends up signed out regardless.
  });

  response.cookies.set(sessionCookie('', 0));
  return response;
}

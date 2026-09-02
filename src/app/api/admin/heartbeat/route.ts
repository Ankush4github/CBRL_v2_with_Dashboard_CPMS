import { NextResponse } from 'next/server';

import { idleTimeoutSeconds } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "The editor is still here."
 *
 * The dashboard's editors hold their draft in the browser and only reach the
 * server on save, so someone typing a long abstract generates no requests for
 * minutes at a time — and the idle timeout, which can only see requests, would
 * sign them out mid-sentence. `SessionTimeout` posts here when it has seen real
 * interaction, which turns keyboard and pointer activity into something the
 * server can count.
 *
 * There is no body and nothing to do: reaching this handler at all means the
 * proxy already found a live session and slid its activity clock forward. POST
 * rather than GET so the proxy's `Origin` check applies — extending a session
 * is exactly the sort of thing another site should not be able to trigger.
 *
 * The remaining idle allowance comes back so a client whose timer has drifted
 * (a sleeping laptop, a throttled background tab) can resynchronise.
 */
export async function POST() {
  return NextResponse.json(
    { ok: true, idleTimeoutSeconds: idleTimeoutSeconds() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

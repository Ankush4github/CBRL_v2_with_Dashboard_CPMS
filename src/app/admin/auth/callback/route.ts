import { NextResponse, type NextRequest } from 'next/server';

import {
  createSessionToken,
  idleTimeoutSeconds,
  isAdminConfigured,
  sessionCookie,
} from '@/lib/admin-auth';
import { expectedOrigin } from '@/lib/admin-network';
import { isSiteEditor } from '@/lib/site-editor';
import { createRequestClient } from '@/lib/supabase/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where Google sends the editor back to after sign-in.
 *
 * Trades the one-time `code` for a session, checks the account actually holds a
 * `site_editors` grant, and only then issues the activity cookie that the proxy
 * requires. Reachable without a session by design — it is what creates one —
 * so it sits in the proxy's short list of exempt paths, still behind the IP
 * allowlist.
 *
 * This URL must be registered under Supabase → Authentication → URL
 * Configuration, or Google returns a redirect mismatch.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const requested = request.nextUrl.searchParams.get('next');

  // Only ever bounce to a path inside the dashboard. The `//` guard matters:
  // `new URL('//evil.example', origin)` is protocol-relative and resolves to
  // another host entirely, turning this into an open redirect.
  const target =
    requested && requested.startsWith('/admin') && !requested.startsWith('//')
      ? requested
      : '/admin';

  // Behind Apache, `request.url` is the internal `http://localhost:3200`, so
  // redirects are built on the public origin instead.
  const origin = expectedOrigin(request, request.nextUrl.origin);

  const fail = (reason: string) => {
    const url = new URL('/admin/login', origin);
    url.searchParams.set('reason', reason);
    return NextResponse.redirect(url);
  };

  // Without the signing secret createSessionToken throws, which surfaced as an
  // unhandled 500 after a successful Google sign-in. The login page explains
  // what is missing when the dashboard is not configured.
  if (!isAdminConfigured()) return NextResponse.redirect(new URL('/admin/login', origin));

  if (!code) return fail('failed');

  // Built before the client, because that is where the new auth cookies land.
  const response = NextResponse.redirect(new URL(target, origin));
  const supabase = createRequestClient(request, response);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail('failed');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('failed');

  if (!(await isSiteEditor(supabase, user.id))) {
    // Signed in, but not a website editor. Their Supabase session is left
    // intact on purpose: this project is shared with CPMS, so the account may
    // belong to a clinician who simply opened the wrong URL, and signing them
    // out here would sign them out of the patient system as well.
    return fail('denied');
  }

  // The cookie lives only as long as the idle timeout — a browser closed and
  // reopened an hour later has nothing to send. The eight-hour absolute cap
  // rides inside the signed token, and the proxy re-issues this cookie on every
  // request the editor makes.
  response.cookies.set(sessionCookie(await createSessionToken(), idleTimeoutSeconds()));
  return response;
}

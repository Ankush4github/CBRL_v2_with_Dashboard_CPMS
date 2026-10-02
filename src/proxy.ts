import { NextResponse, type NextRequest } from 'next/server';

import {
  SESSION_COOKIE,
  checkSession,
  cookieLifetime,
  refreshSessionToken,
  sessionCookie,
} from '@/lib/admin-auth';
import {
  RESTRICTED_IP_HEADER,
  RESTRICTED_PAGE_PATH,
  clientIp,
  expectedOrigin,
  isAllowedIp,
} from '@/lib/admin-network';
import { isSiteEditor } from '@/lib/site-editor';
import { createRequestClient } from '@/lib/supabase/request';

/**
 * Gate on the dashboard and its API.
 *
 * Four checks, outermost first, so that everything below them — including the
 * sign-in flow itself — sits behind the network restrictions:
 *
 *   1. the IP allowlist, when one is configured;
 *   2. the request's `Origin`, on anything that writes;
 *   3. a valid Supabase session *and* a live `site_editors` grant;
 *   4. a non-idle activity cookie.
 *
 * 3 and 4 answer different questions and both have to pass. Supabase says who
 * you are and the grant says you are allowed here, but neither expires with
 * inactivity — Supabase refreshes its token indefinitely. The activity cookie
 * is what makes an unattended dashboard sign itself out, and this is also where
 * it slides: every authenticated request winds its clock forward, so "still
 * working" needs no cooperation from individual routes.
 *
 * Keeping all four here means no route can ship without them.
 */

/** Methods that cannot change anything, so they need no `Origin`. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function noStore(response: NextResponse): NextResponse {
  // Nothing under /admin should ever sit in a shared cache.
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  return response;
}

/** Drop the activity cookie, so an expired one stops being sent back. */
function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(sessionCookie('', 0));
  return response;
}

/**
 * Move any cookies Supabase wrote onto a different response.
 *
 * The client refreshes the access token in place and rotates the refresh token
 * with it. Those land on the response it was constructed with, so returning a
 * freshly built redirect instead would discard the rotation and invalidate a
 * perfectly good session.
 */
function carryAuthCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/admin');

  // 1. Network allowlist. Off unless ADMIN_ALLOWED_IPS is set, in which case it
  //    applies to the sign-in flow too — that is the point of it.
  const ip = clientIp(request);
  if (!isAllowedIp(ip)) {
    // API callers are code: they get JSON, with the reason machine-readable.
    // The address is included because it turns a misconfigured allowlist into
    // something the administrator can diagnose, and it tells the caller only
    // their own address, which they already know.
    if (isApi) {
      return noStore(
        NextResponse.json(
          {
            error: 'The dashboard is not available from your network.',
            reason: 'network',
            ip: ip ?? 'unknown',
          },
          { status: 403 }
        )
      );
    }

    // People get a page. A rewrite rather than a redirect: the browser keeps
    // the URL it asked for, so the page's "Try again" is a reload of that same
    // request through this same check. Still a 403, and still decided here --
    // the page only renders the outcome, from the address passed below.
    const forwarded = new Headers(request.headers);
    forwarded.set(RESTRICTED_IP_HEADER, ip ?? 'unknown');
    return noStore(
      NextResponse.rewrite(new URL(RESTRICTED_PAGE_PATH, request.url), {
        status: 403,
        request: { headers: forwarded },
      })
    );
  }

  // Every request allowed past this point has the restricted-page header
  // removed, so only the branch above can set it.
  const passHeaders = new Headers(request.headers);
  passHeaders.delete(RESTRICTED_IP_HEADER);
  const pass = () => NextResponse.next({ request: { headers: passHeaders } });

  // 2. Origin check on anything that writes. `SameSite=Lax` alone is not enough
  //    here: it treats every *.iitkgp.ac.in host as same-site, so a compromised
  //    neighbour could otherwise drive authenticated writes with the admin's
  //    cookie attached. Browsers always send `Origin` on cross-origin and on
  //    same-origin writes, so requiring it costs nothing — except for
  //    non-browser clients like curl, which is documented.
  if (isApi && !SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get('origin');
    if (origin !== expectedOrigin(request, request.nextUrl.origin)) {
      return noStore(
        NextResponse.json(
          { error: 'This request did not come from the dashboard.' },
          { status: 403 }
        )
      );
    }
  }

  // 3. The two endpoints that must stay reachable without a session: the OAuth
  //    callback is what creates one, and sign-out has to work on a session that
  //    has already lapsed.
  if (pathname === '/admin/auth/callback' || pathname === '/api/admin/logout') {
    return noStore(pass());
  }

  // Everything below consults Supabase, so the response has to exist before the
  // client does — it is where refreshed auth cookies get written.
  const response = pass();
  const supabase = createRequestClient(request, response);

  // getUser(), not getSession(): the latter decodes the cookie and believes it.
  // The cookie is attacker-supplied input, and this is the call that actually
  // validates it against the auth server.
  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Supabase unreachable. Fail closed — an outage must not open the gate.
    userId = null;
  }

  const now = Date.now();
  const activity = await checkSession(request.cookies.get(SESSION_COOKIE)?.value, now).catch(
    () => ({ status: 'invalid' }) as const
  );

  const editor = userId ? await isSiteEditor(supabase, userId) : false;
  const signedIn = Boolean(userId) && editor && activity.status === 'active';

  if (pathname === '/admin/login') {
    // Deliberately not clearing the cookie here. Any request that reached the
    // login screen has already had it cleared by the branch that sent them, and
    // a stray in-flight load of this page landing just after a successful
    // sign-in would otherwise delete the session that was just issued.
    if (!signedIn) return noStore(response);
    return noStore(carryAuthCookies(response, NextResponse.redirect(new URL('/admin', expectedOrigin(request, request.nextUrl.origin)))));
  }

  if (signedIn && activity.status === 'active') {
    // Slide the activity clock. Every request through here is either the editor
    // acting or the heartbeat reporting that they are still at the keyboard;
    // either way the session has just been used.
    response.cookies.set(
      sessionCookie(await refreshSessionToken(activity.session, now), cookieLifetime(activity.session, now))
    );
    return noStore(response);
  }

  // A signed-in account without a grant is turned away, but its Supabase
  // session is left completely alone. On this shared project that account may
  // well be a CPMS clinician who simply opened the wrong URL, and signing them
  // out here would sign them out of the patient system too.
  const denied = Boolean(userId) && !editor;
  const timedOut = !denied && activity.status === 'idle';

  if (isApi) {
    return noStore(
      clearSession(
        carryAuthCookies(
          response,
          NextResponse.json(
            {
              error: denied
                ? 'This account is not a website editor.'
                : timedOut
                  ? 'Signed out after a period of inactivity. Sign in again to continue.'
                  : 'Not signed in.',
              // Lets a fetch that loses the race with the timer tell the cases
              // apart without parsing the message.
              reason: denied ? 'forbidden' : timedOut ? 'timeout' : 'unauthenticated',
            },
            { status: denied ? 403 : 401 }
          )
        )
      )
    );
  }

  const login = new URL('/admin/login', expectedOrigin(request, request.nextUrl.origin));
  // Bounce back to the page they were after once they sign in.
  if (pathname !== '/admin') login.searchParams.set('next', `${pathname}${search}`);
  if (denied) login.searchParams.set('reason', 'denied');
  else if (timedOut) login.searchParams.set('reason', 'timeout');

  return noStore(clearSession(carryAuthCookies(response, NextResponse.redirect(login))));
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

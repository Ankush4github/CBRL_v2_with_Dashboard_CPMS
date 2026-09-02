/**
 * The dashboard's activity clock.
 *
 * Identity comes from Supabase Auth — who you are, and whether you hold a
 * `site_editors` grant. This module answers a different question that Supabase
 * does not: *how recently were you here*. Supabase issues an access token with
 * a fixed lifetime and silently refreshes it, which means a session left open
 * on an unattended machine stays valid indefinitely. The two properties the
 * previous password-based dashboard had — a real idle timeout and an absolute
 * cap — are not things Supabase provides, so they are kept here and enforced
 * alongside it. A request needs both to get through the proxy.
 *
 * Signing uses Web Crypto rather than `node:crypto` so the exact same code
 * verifies the cookie in the proxy (Edge runtime) and inside route handlers.
 *
 * The cookie carries no secret of its own — just two timestamps and a signature
 * over them — so a stolen cookie expires on its own and rotating
 * `ADMIN_SESSION_SECRET` invalidates every session at once. It is deliberately
 * not the Supabase session: revoking a `site_editors` grant takes effect on the
 * next request regardless of what this cookie says.
 *
 * Two clocks run against a session, and it dies to whichever fires first:
 *
 *   - `exp`, the absolute cap. Fixed at login and never moved, so no amount of
 *     activity keeps one session alive beyond `SESSION_MAX_AGE_SECONDS`.
 *   - `seen`, last activity. Slid forward by the proxy on every authenticated
 *     request; once it falls further behind than the idle timeout the session
 *     is over.
 *
 * Keeping `seen` inside the signed payload is what makes the idle timeout real
 * rather than decorative: the browser cannot move it, so a client that simply
 * never runs the timer still gets logged out by the server.
 */

/**
 * The `__Host-` prefix binds the cookie to this exact host: the browser will
 * only accept it with `Secure`, `Path=/` and no `Domain`, which means no
 * sibling `*.iitkgp.ac.in` site can set or shadow it. The prefix is dropped in
 * development because a `__Host-` cookie without `Secure` is refused outright,
 * and `npm run dev` serves plain HTTP.
 */
import { isSupabaseConfigured } from './supabase/config';

export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-cbrl_admin_session' : 'cbrl_admin_session';

/** Eight hours: long enough for an editing session, short enough to matter. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Five minutes of no activity ends the session. */
const DEFAULT_IDLE_TIMEOUT_SECONDS = 5 * 60;

/**
 * How long a session survives without activity.
 *
 * Five minutes is deliberately short, and short enough to be disruptive: the
 * content editors hold an unsaved draft in the browser and only reach the
 * server on save, so an editor part-way through a publication abstract is
 * making no requests at all. `SessionTimeout` covers that by treating typing
 * and pointer movement as activity and warning before the session goes, but if
 * the dashboard is used for longer-form writing, raise this — a timeout people
 * work around is worse than a longer one they don't.
 *
 * Read per call rather than captured at module load: the Edge runtime that
 * evaluates the proxy does not necessarily share a module instance with the
 * Node runtime that serves the routes.
 */
export function idleTimeoutSeconds(): number {
  const raw = process.env.ADMIN_IDLE_TIMEOUT_MINUTES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_IDLE_TIMEOUT_SECONDS;

  const minutes = Number(raw);
  // A typo here would silently weaken (or effectively remove) the timeout, so
  // anything unparseable falls back to the default rather than to "no limit".
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_IDLE_TIMEOUT_SECONDS;

  // Never longer than the absolute cap, where it would have no effect at all.
  return Math.min(Math.round(minutes * 60), SESSION_MAX_AGE_SECONDS);
}

interface SessionPayload {
  /** Absolute expiry, seconds since epoch. Fixed at login; sliding never moves it. */
  exp: number;
  /** Last activity, seconds since epoch. Slid forward on each authenticated request. */
  seen: number;
  /** Bumped if the payload shape ever changes. */
  v: 2;
}

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function requireSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'ADMIN_SESSION_SECRET is missing or too short — set at least 16 characters in .env.local'
    );
  }
  return secret;
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(requireSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

/** Length-safe, content-constant comparison. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sign(payload: SessionPayload): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return `${body}.${base64UrlEncode(await hmac(body))}`;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const seconds = Math.floor(now / 1000);
  return sign({ exp: seconds + SESSION_MAX_AGE_SECONDS, seen: seconds, v: 2 });
}

/**
 * The same session with its activity clock wound forward.
 *
 * `exp` is copied across untouched — that is the whole point of holding the two
 * clocks separately, and re-deriving it here would turn the absolute cap into
 * another sliding window.
 */
export async function refreshSessionToken(
  session: SessionPayload,
  now = Date.now()
): Promise<string> {
  return sign({ ...session, seen: Math.floor(now / 1000) });
}

/**
 * Why a request is or isn't signed in.
 *
 * `idle` is kept distinct from `invalid` so the dashboard can say what actually
 * happened. It is only ever reported for a genuinely valid signature, so it
 * tells an attacker nothing they could not already determine.
 */
export type SessionCheck =
  | { status: 'active'; session: SessionPayload }
  | { status: 'idle' }
  | { status: 'invalid' };

/** How long the payload claims to be, before any of it is believed. */
function parsePayload(body: string): SessionPayload | null {
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
  if (payload?.v !== 2) return null;
  if (typeof payload.exp !== 'number' || typeof payload.seen !== 'number') return null;
  return payload;
}

export async function checkSession(
  token: string | undefined | null,
  now = Date.now()
): Promise<SessionCheck> {
  if (!token) return { status: 'invalid' };

  const [body, signature] = token.split('.');
  if (!body || !signature) return { status: 'invalid' };

  try {
    if (!timingSafeEqual(base64UrlDecode(signature), await hmac(body))) return { status: 'invalid' };

    const session = parsePayload(body);
    if (!session) return { status: 'invalid' };

    const seconds = now / 1000;
    if (session.exp <= seconds) return { status: 'invalid' };

    // A `seen` in the future means a clock moved backwards, not that the user
    // was just here; treat the session as current rather than locking them out
    // for the difference.
    if (seconds - session.seen > idleTimeoutSeconds()) return { status: 'idle' };

    return { status: 'active', session };
  } catch {
    return { status: 'invalid' };
  }
}

/**
 * Cookie attributes, in one place so the proxy, login and logout cannot drift
 * apart on `httpOnly` or `secure` — the two that matter and the two that are
 * silently survivable when wrong in development.
 */
export function sessionCookie(value: string, maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    // The live site is HTTPS; plain-HTTP dev would never receive the cookie
    // back if this were hardcoded on.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * How long the browser should keep the cookie: the idle timeout, so a closed
 * laptop drops the session on its own without the server being involved, but
 * never past the absolute expiry.
 */
export function cookieLifetime(session: SessionPayload, now = Date.now()): number {
  return Math.max(0, Math.min(idleTimeoutSeconds(), session.exp - Math.floor(now / 1000)));
}

/**
 * True when the dashboard has been configured at all.
 *
 * `ADMIN_PASSWORD` is gone — there is no shared password any more. Sign-in is
 * Supabase Google OAuth plus a `site_editors` grant, so what has to be present
 * is the Supabase project and the secret that signs the activity cookie.
 */
export function isAdminConfigured(): boolean {
  return isSupabaseConfigured() && (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 16;
}

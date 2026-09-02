'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * The client half of the idle timeout.
 *
 * The server half — in `proxy.ts` — is what actually ends the session, and it
 * does so whether or not any of this runs. This exists for two things it cannot
 * do from there:
 *
 *   1. Report activity it would otherwise never see. The editors keep their
 *      draft in the browser and only reach the server on save, so half an hour
 *      of typing looks identical to half an hour of an empty chair. A heartbeat
 *      on real interaction is what tells those apart.
 *   2. Warn before the session goes, rather than turning an unsaved draft into
 *      a login screen with no notice.
 *
 * Everything is measured against `Date.now()` rather than counted down with
 * chained timers: a laptop that slept, or a background tab whose timers were
 * throttled to once a minute, then still gets the right answer on its next
 * tick instead of believing no time passed.
 */

/**
 * What counts as being at the keyboard. Pointer movement is included
 * deliberately — by the time the warning shows, the pointer has not moved at
 * all for minutes, so someone who arrives and nudges the mouse really is back.
 */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

/** Shared between tabs, so working in one keeps the others signed in. */
const ACTIVITY_KEY = 'cbrl-admin-last-activity';

/** Activity is continuous; recording it more than once a second is waste. */
const RECORD_THROTTLE_MS = 1_000;

const TICK_MS = 1_000;

export default function SessionTimeout({ idleTimeoutSeconds }: { idleTimeoutSeconds: number }) {
  const router = useRouter();
  const idleMs = idleTimeoutSeconds * 1_000;

  // A minute to save, unless the whole timeout is so short that a minute would
  // mean warning from the moment the page loads.
  const warningMs = Math.min(60_000, Math.floor(idleMs / 2));
  // Frequent enough that the server's activity clock never trails the browser's
  // by enough to matter, rare enough to stay invisible.
  const heartbeatMs = Math.max(20_000, Math.floor(idleMs / 4));

  /** Seconds left, while the warning is up; null when it is not. */
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const lastActivity = useRef(0);
  const lastRecorded = useRef(0);
  const lastHeartbeat = useRef(0);
  const signingOut = useRef(false);

  // Seeded on mount, not at render: during the server pass `Date.now()` is the
  // server's clock, which is not the one every other reading here is taken
  // against. Effects run in declaration order, so both are set before the tick
  // below is scheduled.
  useEffect(() => {
    const now = Date.now();
    lastActivity.current = now;
    // The page load that got this far already slid the server's activity clock,
    // so the first heartbeat is not due until there is something to report.
    lastHeartbeat.current = now;
  }, []);

  const endSession = useCallback(
    async (reason: 'timeout' | 'unauthenticated') => {
      // Several paths can reach this at once — the tick, an in-flight fetch, a
      // sibling tab — and only the first should do anything.
      if (signingOut.current) return;
      signingOut.current = true;

      try {
        await fetch('/api/admin/logout', { method: 'POST' });
      } catch {
        // The cookie expires on its own; a failed logout must not strand the
        // editor on a dashboard that can no longer save.
      }

      const params = new URLSearchParams();
      if (reason === 'timeout') params.set('reason', 'timeout');
      // Return them to the page they were on once they sign back in.
      const path = window.location.pathname;
      if (path.startsWith('/admin') && path !== '/admin') params.set('next', path);

      const query = params.toString();
      router.replace(query ? `/admin/login?${query}` : '/admin/login');
      router.refresh();
    },
    [router]
  );

  const recordActivity = useCallback((at: number) => {
    lastActivity.current = at;
    lastRecorded.current = at;
    try {
      window.localStorage.setItem(ACTIVITY_KEY, String(at));
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). Only the
      // cross-tab courtesy is lost; this tab still times out correctly.
    }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    lastHeartbeat.current = Date.now();
    try {
      const response = await fetch('/api/admin/heartbeat', { method: 'POST' });
      if (response.status === 401) {
        const payload = await response.json().catch(() => ({}));
        void endSession(payload?.reason === 'timeout' ? 'timeout' : 'unauthenticated');
      }
    } catch {
      // Offline, most likely. The local timer still governs, and a save will
      // surface the real problem.
    }
  }, [endSession]);

  /* --------------------------------------------------------- activity input */

  useEffect(() => {
    const onActivity = () => {
      const now = Date.now();
      if (now - lastRecorded.current < RECORD_THROTTLE_MS) return;
      recordActivity(now);
    };

    // Capture, so activity inside a scrolling panel counts as much as activity
    // on the page itself.
    const options = { capture: true, passive: true } as const;
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, options);

    // `storage` only fires in the *other* tabs, which is exactly the signal
    // wanted: adopt their activity, never echo our own back.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVITY_KEY || !event.newValue) return;
      const at = Number(event.newValue);
      if (Number.isFinite(at) && at > lastActivity.current) lastActivity.current = at;
    };
    window.addEventListener('storage', onStorage);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, options);
      window.removeEventListener('storage', onStorage);
    };
  }, [recordActivity]);

  /* ------------------------------------------------------------------ clock */

  useEffect(() => {
    const evaluate = () => {
      if (signingOut.current) return;

      const now = Date.now();
      const idleFor = now - lastActivity.current;

      if (idleFor >= idleMs) {
        void endSession('timeout');
        return;
      }

      const remaining = idleMs - idleFor;
      setSecondsLeft(remaining <= warningMs ? Math.ceil(remaining / 1_000) : null);

      // Only worth a request if something has actually happened since the last
      // one — otherwise the heartbeat would keep an empty chair signed in.
      if (lastActivity.current > lastHeartbeat.current && now - lastHeartbeat.current >= heartbeatMs) {
        void sendHeartbeat();
      }
    };

    const timer = window.setInterval(evaluate, TICK_MS);
    // A tab that was hidden may have had its timers throttled; re-check the
    // moment it comes back rather than waiting out the next tick. Becoming
    // visible is not itself activity, so this only reads the clock.
    document.addEventListener('visibilitychange', evaluate);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', evaluate);
    };
  }, [endSession, heartbeatMs, idleMs, sendHeartbeat, warningMs]);

  /* ------------------------------------------------------------------- warn */

  const staySignedIn = useCallback(() => {
    recordActivity(Date.now());
    setSecondsLeft(null);
    void sendHeartbeat();
  }, [recordActivity, sendHeartbeat]);

  if (secondsLeft === null) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
        className="relative w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <Clock className="h-4 w-4 text-destructive" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="session-timeout-title" className="text-base font-semibold text-foreground">
              Still there?
            </h2>
            {/* Not a live region: re-announcing every second would drown out
                everything else. The dialog announces this once when it opens,
                and the count below is a visual aid on top of that. */}
            <p id="session-timeout-description" className="mt-1 text-sm text-muted-foreground">
              You&rsquo;ll be signed out shortly because of inactivity. Any unsaved changes will be
              lost.
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-3xl font-semibold tabular-nums text-foreground">
          <span aria-hidden="true">
            {secondsLeft}
            <span className="ml-1 text-base font-normal text-muted-foreground">
              second{secondsLeft === 1 ? '' : 's'}
            </span>
          </span>
        </p>

        <div className="mt-5 flex gap-2">
          <Button type="button" className="flex-1" autoFocus onClick={staySignedIn}>
            Stay signed in
          </Button>
          <Button type="button" variant="ghost" onClick={() => void endSession('timeout')}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

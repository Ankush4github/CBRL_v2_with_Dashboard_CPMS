"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const WARNING_BEFORE_TIMEOUT = 60 * 1000; // Show warning 1 minute before timeout

/**
 * When this browser last saw the signed-in user do anything, shared by every
 * CPMS tab.
 *
 * Timers alone only run while a tab is open. The session itself lives in
 * localStorage and refreshes indefinitely, so closing the tab instead of
 * signing out left a clinic workstation that reopened /cpms hours later still
 * signed in. Persisting the last activity lets the next load notice the gap.
 * Sharing it also stops an idle tab from signing out a user who is busy in
 * another one — sign-out reaches every tab, so it has to be every tab's call.
 */
const LAST_ACTIVITY_KEY = 'cpms:last-activity';

function readLastActivity(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLastActivity(at: number) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Storage blocked: the in-tab timers below still apply.
  }
}

function clearLastActivity() {
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Nothing to clear.
  }
}

export const useInactivityTimeout = () => {
  const { user, loading, signOut } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasWarnedRef = useRef(false);
  // `schedule` re-arms itself from inside its own timer; the ref is how the
  // callback reaches the current version of itself.
  const scheduleRef = useRef<(since: number) => void>(() => {});

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
  }, []);

  const handleLogout = useCallback(async () => {
    clearLastActivity();
    toast.info('You have been logged out due to inactivity');
    await signOut();
  }, [signOut]);

  const showWarning = useCallback(() => {
    if (!hasWarnedRef.current) {
      hasWarnedRef.current = true;
      toast.warning('You will be logged out in 1 minute due to inactivity', {
        duration: 10000,
      });
    }
  }, []);

  // Arm both timers to fire relative to `since`, the last activity seen in any
  // tab. When the logout timer fires it checks again, because another tab may
  // have recorded activity in the meantime.
  const schedule = useCallback(
    (since: number) => {
      clearTimers();
      if (!user) return;

      const remaining = since + INACTIVITY_TIMEOUT - Date.now();
      if (remaining <= 0) {
        handleLogout();
        return;
      }

      warningTimeoutRef.current = setTimeout(
        showWarning,
        Math.max(0, remaining - WARNING_BEFORE_TIMEOUT)
      );
      timeoutRef.current = setTimeout(() => {
        const latest = readLastActivity() ?? since;
        if (latest > since) {
          hasWarnedRef.current = false;
          scheduleRef.current(latest);
        } else {
          handleLogout();
        }
      }, remaining);
    },
    [user, clearTimers, handleLogout, showWarning]
  );

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  const resetTimer = useCallback(() => {
    hasWarnedRef.current = false;
    const now = Date.now();
    writeLastActivity(now);
    schedule(now);
  }, [schedule]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      clearTimers();
      // Signed out, by whatever route. A stale timestamp left behind would
      // otherwise sign the next person out the moment they signed in.
      clearLastActivity();
      return;
    }

    // A session restored from storage after the browser sat idle past the
    // limit — the tab was closed rather than signed out of — ends here.
    const last = readLastActivity();
    if (last !== null && Date.now() - last > INACTIVITY_TIMEOUT) {
      handleLogout();
      return;
    }

    // Activity events to track
    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    // Throttle reset to avoid excessive calls
    let lastReset = 0;
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 1000) { // Only reset once per second max
        lastReset = now;
        resetTimer();
      }
    };

    // Activity in another tab moves this tab's clock too.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY || event.newValue === null) return;
      const at = Number(event.newValue);
      if (Number.isFinite(at)) {
        hasWarnedRef.current = false;
        schedule(at);
      }
    };

    // A laptop waking from sleep: timers may not have fired on time.
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule(readLastActivity() ?? Date.now());
    };

    events.forEach((event) => {
      document.addEventListener(event, throttledReset, { passive: true });
    });
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);

    // Start the initial timer
    resetTimer();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, throttledReset);
      });
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimers();
    };
  }, [user, loading, resetTimer, schedule, clearTimers, handleLogout]);

  return { resetTimer };
};

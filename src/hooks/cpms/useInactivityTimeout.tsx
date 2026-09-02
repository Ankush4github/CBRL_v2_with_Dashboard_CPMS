"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const WARNING_BEFORE_TIMEOUT = 60 * 1000; // Show warning 1 minute before timeout

export const useInactivityTimeout = () => {
  const { user, signOut } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasWarnedRef = useRef(false);

  const handleLogout = useCallback(async () => {
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

  const resetTimer = useCallback(() => {
    hasWarnedRef.current = false;

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    // Only set timers if user is logged in
    if (user) {
      // Set warning timer (1 minute before logout)
      warningTimeoutRef.current = setTimeout(() => {
        showWarning();
      }, INACTIVITY_TIMEOUT - WARNING_BEFORE_TIMEOUT);

      // Set logout timer
      timeoutRef.current = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    }
  }, [user, handleLogout, showWarning]);

  useEffect(() => {
    if (!user) {
      // Clear timers when user logs out
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
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
    let lastReset = Date.now();
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 1000) { // Only reset once per second max
        lastReset = now;
        resetTimer();
      }
    };

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, throttledReset, { passive: true });
    });

    // Start the initial timer
    resetTimer();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, throttledReset);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [user, resetTimer]);

  return { resetTimer };
};

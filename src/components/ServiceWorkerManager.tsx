'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Owns the lifecycle of /sw.js — registration in production, teardown in
 * development.
 *
 * Nothing else belongs here. Resource hints, font preloads and critical CSS all
 * have to be in the document head to do any good; issuing them from an effect
 * runs them after hydration, by which point the browser has already made every
 * request they were meant to influence.
 *
 * This is mounted from the root layout, which now covers CPMS at /cpms as well.
 * It must not run there. CPMS registers its own worker at /cpms/sw.js, scoped to
 * /cpms/, for push notifications; this one claims scope / and its development
 * branch unregisters *every* worker on the origin, which would tear that one
 * down on any visit to a CPMS page.
 */
export default function ServiceWorkerManager() {
  const pathname = usePathname();
  const isCpms = pathname === '/cpms' || pathname.startsWith('/cpms/');

  useEffect(() => {
    if (isCpms) return;
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'production') {
      // Registration waits for load so it never competes with the initial
      // render for bandwidth.
      const register = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .catch((error) => console.warn('SW registration failed:', error));
      };

      if (document.readyState === 'complete') {
        register();
      } else {
        window.addEventListener('load', register);
        return () => window.removeEventListener('load', register);
      }
      return;
    }

    // In development a stale worker from a previous production build can
    // intercept RSC payload requests and abort them, so make sure none is left
    // controlling the page.
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch((error) => console.warn('SW unregister failed:', error));

    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch((error) => console.warn('SW cache cleanup failed:', error));
    }
  }, [isCpms]);

  return null;
}

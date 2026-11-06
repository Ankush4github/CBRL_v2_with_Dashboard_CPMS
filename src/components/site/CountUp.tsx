'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts a statistic up once, when it scrolls into view.
 *
 * The server renders the final value, so crawlers, no-JS visitors and
 * reduced-motion users all see the real figure; only the leading number of
 * the string is animated ("10Cr+" counts 0→10 and keeps its "Cr+").
 */
export default function CountUp({ value, durationMs = 1200 }: { value: string; durationMs?: number }) {
  const match = value.match(/^(\D*)(\d[\d,]*)(.*)$/);
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !match) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    const [, prefix, digits, suffix] = match;
    const target = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(target) || target === 0) return;
    const grouped = digits.includes(',');

    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - t, 3);
          const n = Math.round(target * eased);
          setDisplay(`${prefix}${grouped ? n.toLocaleString('en-IN') : n}${suffix}`);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {/* Screen readers get the real value, not each animation frame. */}
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

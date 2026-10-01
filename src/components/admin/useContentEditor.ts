'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface SaveIssue {
  path: string;
  message: string;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Draft state for one content document.
 *
 * The editor works on a local copy and only touches the server on save, so a
 * half-finished edit never reaches the live site. What comes back from the save
 * becomes the new baseline — the server normalises (trims strings, drops blank
 * rows, de-duplicates ids), and the form should show what actually landed.
 */
export function useContentEditor<T>(initial: T, endpoint: string) {
  const [draft, setDraft] = useState<T>(initial);
  const [baseline, setBaseline] = useState<T>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SaveIssue[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline]
  );

  // Warn before a reload or tab close drops unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const save = useCallback(async () => {
    setState('saving');
    setError(null);
    setIssues([]);

    try {
      const response = await fetch(endpoint, {
        // POST, not PUT: CIC's Apache refuses PUT before it reaches the app.
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setState('error');
        setError(payload?.error ?? `Save failed (${response.status}).`);
        setIssues(Array.isArray(payload?.issues) ? payload.issues : []);
        return false;
      }

      const saved = (payload?.data ?? draft) as T;
      setDraft(saved);
      setBaseline(saved);
      setSavedAt(payload?.savedAt ?? new Date().toISOString());
      setState('saved');

      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setState('idle'), 4000);
      return true;
    } catch {
      setState('error');
      setError('Could not reach the server. Check your connection and try again.');
      return false;
    }
  }, [draft, endpoint]);

  const revert = useCallback(() => {
    setDraft(baseline);
    setState('idle');
    setError(null);
    setIssues([]);
  }, [baseline]);

  return { draft, setDraft, dirty, state, error, issues, savedAt, save, revert };
}

/* ------------------------------------------------------------ list helpers */

export function replaceAt<T>(list: T[], index: number, value: T): T[] {
  const next = list.slice();
  next[index] = value;
  return next;
}

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** Move an item one slot up (-1) or down (+1); a no-op at the ends. */
export function moveBy<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

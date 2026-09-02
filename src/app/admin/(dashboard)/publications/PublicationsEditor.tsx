'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { PublicationSummary } from '@/lib/publications-admin';
import { AdminPageHeader, EmptyState } from '@/components/admin/EditorChrome';
import PublicationEntryForm, { emptyEntry, type EntryDraft } from './PublicationEntryForm';

type Mode =
  | { kind: 'list' }
  | { kind: 'edit'; id: string; draft: EntryDraft }
  | { kind: 'new'; draft: EntryDraft };

const PAGE_SIZE = 40;

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function PublicationsEditor({ initial }: { initial: PublicationSummary[] }) {
  const [entries, setEntries] = useState(initial);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [doi, setDoi] = useState('');
  const [paste, setPaste] = useState('');

  const years = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.year).filter(Boolean))).sort(
        (a, b) => Number(b) - Number(a)
      ),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (year !== 'all' && entry.year !== year) return false;
      if (!q) return true;
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.author.toLowerCase().includes(q) ||
        entry.venue.toLowerCase().includes(q) ||
        entry.doi.toLowerCase().includes(q)
      );
    });
  }, [entries, query, year]);

  const duplicateCount = entries.filter((e) => e.duplicate).length;

  /** Pull the server's current list back after any write. */
  async function refresh() {
    const response = await fetch('/api/admin/publications');
    const payload = await readJson(response);
    if (response.ok && Array.isArray(payload.entries)) setEntries(payload.entries);
  }

  async function openEntry(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/publications/${encodeURIComponent(id)}`);
      const payload = await readJson(response);
      if (!response.ok) {
        setError(payload?.error ?? 'Could not open that publication.');
        return;
      }
      setMode({
        kind: 'edit',
        id,
        draft: { type: payload.entry.type, key: payload.entry.key, fields: payload.entry.fields },
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveEntry() {
    if (mode.kind === 'list') return;
    setBusy(true);
    setError(null);

    const endpoint =
      mode.kind === 'edit'
        ? `/api/admin/publications/${encodeURIComponent(mode.id)}`
        : '/api/admin/publications';

    try {
      const response = await fetch(endpoint, {
        method: mode.kind === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode.draft),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setError(payload?.error ?? 'Could not save this publication.');
        return;
      }

      await refresh();
      setMode({ kind: 'list' });
      setNotice(mode.kind === 'edit' ? 'Publication updated.' : 'Publication added.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/publications/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const payload = await readJson(response);
      if (!response.ok) {
        setError(payload?.error ?? 'Could not delete that publication.');
        return;
      }
      await refresh();
      setConfirmDelete(null);
      setNotice('Publication removed.');
    } finally {
      setBusy(false);
    }
  }

  async function lookupDoi() {
    if (!doi.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/publications/doi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doi }),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        setError(payload?.error ?? 'Lookup failed.');
        return;
      }
      setMode({ kind: 'new', draft: payload.entry });
      setDoi('');
      setNotice('Fetched from doi.org — check the fields, then save.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function importPaste() {
    if (!paste.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: paste }),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        setError(payload?.error ?? 'Could not import that BibTeX.');
        return;
      }
      await refresh();
      setPaste('');
      setNotice(`Added ${payload.added?.length ?? 0} publication(s).`);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------ edit view */

  if (mode.kind !== 'list') {
    return (
      <div className="pb-16">
        <AdminPageHeader
          eyebrow={mode.kind === 'edit' ? 'Edit publication' : 'New publication'}
          title={
            mode.draft.fields.find((f) => f.name === 'title')?.value || 'Untitled publication'
          }
          lead="Saved straight into publications.bib. Every other entry in the file is left untouched."
          actions={
            <Button variant="outline" size="sm" onClick={() => setMode({ kind: 'list' })}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to list
            </Button>
          }
        />

        <div className="py-8">
          <PublicationEntryForm
            draft={mode.draft}
            onChange={(draft) => setMode({ ...mode, draft })}
          />
        </div>

        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode({ kind: 'list' })}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEntry} disabled={busy}>
              {busy ? 'Saving…' : mode.kind === 'edit' ? 'Save publication' : 'Add publication'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ list view */

  return (
    <div className="pb-16">
      <AdminPageHeader
        eyebrow="Bibliography"
        title="Publications"
        lead="The BibTeX file behind the publications page. Entries are grouped by year on the site."
        page="/publications"
        actions={
          <Button size="sm" onClick={() => setMode({ kind: 'new', draft: emptyEntry() })}>
            <Plus className="h-3.5 w-3.5" />
            Add manually
          </Button>
        }
      />

      {/* Add by DOI or paste — the two ways a new paper usually arrives. */}
      <section className="grid gap-4 border-b py-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Add by DOI
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Fetches the record from doi.org so nothing has to be retyped.
          </p>
          <div className="mt-4 flex gap-2">
            <Input
              value={doi}
              onChange={(event) => setDoi(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && lookupDoi()}
              placeholder="10.1016/j.bios.2026.118980"
            />
            <Button size="sm" onClick={lookupDoi} disabled={busy || !doi.trim()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Fetch'}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Paste BibTeX
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Straight from the journal&rsquo;s export. Several entries at once is fine.
          </p>
          <Textarea
            rows={3}
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder="@article{Key2026, title = {…}, … }"
            className="mt-4 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={importPaste}
            disabled={busy || !paste.trim()}
          >
            <Copy className="h-3.5 w-3.5" />
            Import
          </Button>
        </div>
      </section>

      {(error || notice) && (
        <div
          className={cn(
            'mt-6 flex items-start gap-2 rounded-md border p-3 text-sm',
            error
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : 'border-primary/30 bg-primary/5 text-foreground'
          )}
        >
          {error ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          )}
          <span className="flex-1">{error ?? notice}</span>
          <button
            type="button"
            className="text-xs underline-offset-4 hover:underline"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {duplicateCount > 0 && (
        <p className="mt-6 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{duplicateCount} entries</span> share a
          citation key with another — the same paper listed twice, so it appears twice on the
          publications page. They are marked below; delete the extras when convenient.
        </p>
      )}

      <section className="flex flex-col gap-4 border-b py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Year
          </span>
          <select
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setShown(PAGE_SIZE);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {filtered.length} of {entries.length}
          </span>
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(PAGE_SIZE);
            }}
            placeholder="Title, author, journal or DOI"
            className="pl-9"
          />
        </div>
      </section>

      <div className="divide-y border-b">
        {filtered.length === 0 ? (
          <EmptyState>Nothing matches that filter.</EmptyState>
        ) : (
          filtered.slice(0, shown).map((entry) => (
            <article key={entry.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-primary">
                    {entry.year}
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {entry.type}
                  </span>
                  {entry.duplicate && (
                    <Badge variant="outline" className="border-destructive/40 font-normal text-destructive">
                      Duplicate key
                    </Badge>
                  )}
                </div>
                <h3 className="mt-1.5 text-sm font-medium leading-snug text-foreground">
                  {entry.title || 'Untitled'}
                </h3>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{entry.author}</p>
                {entry.venue && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">{entry.venue}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => openEntry(entry.id)} disabled={busy}>
                  Edit
                </Button>
                {confirmDelete === entry.id ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteEntry(entry.id)}
                      disabled={busy}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${entry.title}`}
                    onClick={() => setConfirmDelete(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {shown < filtered.length && (
        <div className="py-6 text-center">
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, filtered.length - shown)} more
          </Button>
        </div>
      )}
    </div>
  );
}

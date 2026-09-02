'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SaveIssue, SaveState } from './useContentEditor';

export function AdminPageHeader({
  eyebrow,
  title,
  lead,
  page,
  actions,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  /** Public page this section drives, linked so an edit can be checked. */
  page?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {lead && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{lead}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {page && (
            <Button asChild variant="outline" size="sm">
              <a href={page} target="_blank" rel="noopener noreferrer">
                View page
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

/**
 * Sticky footer holding the save controls and anything the server rejected.
 * Stays out of the way until there is something to act on.
 */
export function SaveBar({
  dirty,
  state,
  error,
  issues,
  savedAt,
  onSave,
  onRevert,
}: {
  dirty: boolean;
  state: SaveState;
  error: string | null;
  issues: SaveIssue[];
  savedAt: string | null;
  onSave: () => void;
  onRevert: () => void;
}) {
  const saving = state === 'saving';

  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-10 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6">
      {(error || issues.length > 0) && (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error ?? 'Some fields need attention.'}
          </p>
          {issues.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-destructive/90">
              {issues.slice(0, 12).map((issue, index) => (
                <li key={index}>
                  <span className="font-mono">{issue.path || 'document'}</span> {issue.message}
                </li>
              ))}
              {issues.length > 12 && <li>…and {issues.length - 12} more.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Saving…
            </span>
          ) : state === 'saved' ? (
            <span className="flex items-center gap-2 text-primary">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Saved — the live page is updated
            </span>
          ) : dirty ? (
            <span className="text-foreground">Unsaved changes</span>
          ) : savedAt ? (
            <>Last saved {relativeTime(savedAt)}</>
          ) : (
            <>No changes yet</>
          )}
        </p>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRevert}
            disabled={!dirty || saving}
          >
            Discard changes
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One collapsible record in a list — a member, a project, an album. Collapsed
 * by default so a long list stays scannable.
 */
export function ItemCard({
  title,
  subtitle,
  badge,
  index,
  total,
  onMove,
  onRemove,
  removeLabel = 'Remove',
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  index: number;
  total: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  removeLabel?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start gap-2 p-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium tracking-tight text-foreground">
                {title || <span className="italic text-muted-foreground">Untitled</span>}
              </span>
              {badge}
            </span>
            {subtitle && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
            )}
          </span>
          {open ? (
            <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </button>

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Move ${title} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Move ${title} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 text-muted-foreground hover:text-destructive',
              confirming && 'text-destructive'
            )}
            aria-label={`${removeLabel} ${title}`}
            onClick={() => (confirming ? onRemove() : setConfirming(true))}
            onBlur={() => setConfirming(false)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {confirming && (
        <p className="border-t bg-destructive/5 px-4 py-2 text-xs text-destructive">
          Click the bin again to remove this. It is only gone once you save.
        </p>
      )}

      {open && <div className="space-y-6 border-t p-5">{children}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed py-14 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

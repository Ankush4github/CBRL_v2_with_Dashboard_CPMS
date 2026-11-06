'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import { formatAuthors, formatEditors, type Publication } from '@/lib/bibtex-parser';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface PublicationMetrics {
  totalCitations: string | number | null;
  hIndex: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  lastUpdated: string | null;
}

/** Entries rendered before "Show more"; the rest are a click away, not a request away. */
const PAGE_SIZE = 40;

const ARTICLE_TYPES = new Set(['article']);
const CHAPTER_TYPES = new Set(['inbook', 'incollection', 'inproceedings', 'book', 'proceedings']);

const TYPE_FILTERS: { value: 'all' | 'articles' | 'chapters'; label: string; shortLabel: string }[] = [
  { value: 'all', label: 'All Publications', shortLabel: 'All' },
  { value: 'articles', label: 'Journal Articles', shortLabel: 'Articles' },
  { value: 'chapters', label: 'Book Chapters & Proceedings', shortLabel: 'Chapters' },
];

export default function PublicationsClient({
  publications,
  metrics,
}: {
  publications: Publication[];
  metrics: PublicationMetrics;
}) {
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'articles' | 'chapters'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Research topics link here as /publications?q=PCOS. Read once on mount
  // rather than through useSearchParams, which would opt the whole page out
  // of static rendering.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearchQuery(q.slice(0, 100));
  }, []);

  // Any change to the filters starts the list from the top again.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedYear, selectedType, searchQuery]);

  // Citation totals fall back to a live OpenAlex tally only when the curated
  // metrics file doesn't supply them; otherwise the file always wins and the
  // per-DOI lookups would be wasted requests.
  const needsLiveMetrics = metrics.totalCitations === null || metrics.hIndex === null;
  const [metricsLoading, setMetricsLoading] = useState(needsLiveMetrics);
  const [liveTotalCitations, setLiveTotalCitations] = useState<number | null>(null);
  const [liveHIndex, setLiveHIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!needsLiveMetrics || publications.length === 0) return;

    let cancelled = false;
    const computeMetrics = async () => {
      try {
        setMetricsLoading(true);
        const dois = publications.map((p) => p.doi).filter(Boolean) as string[];
        const counts = await Promise.all(
          dois.map(async (doi) => {
            try {
              const res = await fetch(
                `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`
              );
              if (!res.ok) return 0;
              const data = await res.json();
              const c = data?.cited_by_count;
              return typeof c === 'number' ? c : 0;
            } catch {
              return 0;
            }
          })
        );
        if (cancelled) return;
        setLiveTotalCitations(counts.reduce((sum, v) => sum + v, 0));
        const sorted = counts.slice().sort((a, b) => b - a);
        let h = 0;
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i] >= i + 1) h = i + 1;
          else break;
        }
        setLiveHIndex(h);
      } catch {
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    };

    computeMetrics();
    return () => {
      cancelled = true;
    };
  }, [needsLiveMetrics, publications]);

  const displayedCitations =
    metrics.totalCitations !== null
      ? typeof metrics.totalCitations === 'number'
        ? metrics.totalCitations.toLocaleString()
        : metrics.totalCitations
      : metricsLoading || liveTotalCitations === null
        ? '—'
        : liveTotalCitations.toLocaleString();

  const displayedHIndex =
    metrics.hIndex !== null
      ? metrics.hIndex
      : metricsLoading || liveHIndex === null
        ? '—'
        : liveHIndex;

  /* ------------------------------------------------------------- search */

  // Each entry's searchable text is built once, not on every keystroke.
  const index = useMemo(
    () =>
      publications.map((pub) => {
        const type = pub.type.toLowerCase();
        return {
          pub,
          year: typeof pub.year === 'string' ? parseInt(pub.year, 10) : pub.year,
          kind: ARTICLE_TYPES.has(type) ? 'articles' : CHAPTER_TYPES.has(type) ? 'chapters' : 'other',
          text: normalize(
            [pub.title, pub.author, pub.journal, pub.booktitle, pub.publisher, pub.editor, pub.doi, pub.year]
              .filter(Boolean)
              .join(' ')
          ),
        } as const;
      }),
    [publications]
  );

  // The input updates on every keystroke; the list follows a beat behind
  // (useDeferredValue), so typing never waits on re-rendering 185 entries.
  const deferredQuery = useDeferredValue(searchQuery);
  const isStale = deferredQuery !== searchQuery;
  const terms = useMemo(() => normalize(deferredQuery).split(/\s+/).filter(Boolean), [deferredQuery]);

  const searchMatches = useMemo(
    () => (terms.length === 0 ? index : index.filter((e) => terms.every((t) => e.text.includes(t)))),
    [index, terms]
  );

  const typeMatches = (kind: string) =>
    selectedType === 'all' || selectedType === kind;

  // Every count reflects the other active filters, so the numbers on the type
  // chips and the year chips always say what clicking them would show.
  const typeCounts = useMemo(() => {
    const counts = { all: 0, articles: 0, chapters: 0 };
    for (const e of searchMatches) {
      if (selectedYear !== 'all' && e.year !== selectedYear) continue;
      counts.all++;
      if (e.kind === 'articles') counts.articles++;
      if (e.kind === 'chapters') counts.chapters++;
    }
    return counts;
  }, [searchMatches, selectedYear]);

  const yearCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const e of searchMatches) {
      if (selectedType !== 'all' && e.kind !== selectedType) continue;
      counts[e.year] = (counts[e.year] || 0) + 1;
    }
    return counts;
  }, [searchMatches, selectedType]);

  // Years with nothing to show drop out of the bar; the selected one stays so
  // it can be deselected.
  const visibleYears = useMemo(
    () =>
      Object.keys(yearCounts)
        .map(Number)
        .concat(selectedYear === 'all' || yearCounts[selectedYear] ? [] : [selectedYear])
        .sort((a, b) => b - a),
    [yearCounts, selectedYear]
  );
  const totalForYearChips = useMemo(
    () => Object.values(yearCounts).reduce((a, b) => a + b, 0),
    [yearCounts]
  );

  const filteredPublications = useMemo(
    () =>
      searchMatches
        .filter((e) => (selectedYear === 'all' || e.year === selectedYear) && typeMatches(e.kind))
        .map((e) => e.pub),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchMatches, selectedYear, selectedType]
  );

  const sortedYearEntries = useMemo(() => {
    const grouped = new Map<number, Publication[]>();
    for (const pub of filteredPublications.slice(0, visibleCount)) {
      const year = typeof pub.year === 'string' ? parseInt(pub.year, 10) : pub.year;
      if (!grouped.has(year)) grouped.set(year, []);
      grouped.get(year)!.push(pub);
    }
    return [...grouped.entries()].sort(([a], [b]) => b - a);
  }, [filteredPublications, visibleCount]);

  // Keep ?q= in the address bar in step with the search, so a search can be
  // bookmarked or shared — and the research pages' links keep working.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (deferredQuery.trim()) url.searchParams.set('q', deferredQuery.trim());
    else url.searchParams.delete('q');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  }, [deferredQuery]);

  // "/" jumps to the search box, as on most search-heavy sites.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtersActive = Boolean(searchQuery.trim()) || selectedYear !== 'all' || selectedType !== 'all';
  const clearAll = () => {
    setSearchQuery('');
    setSelectedYear('all');
    setSelectedType('all');
    searchRef.current?.focus();
  };

  const formatJournalInfo = (pub: Publication) => {
    const parts = [];
    if (pub.volume) parts.push(`Vol. ${pub.volume}`);
    if (pub.number) parts.push(`No. ${pub.number}`);
    if (pub.pages) parts.push(`pp. ${pub.pages}`);
    return parts.join(', ');
  };

  const formatBookInfo = (pub: Publication) => {
    const parts = [];
    if (pub.editor) parts.push(`Eds: ${formatEditors(pub.editor)}`);
    if (pub.publisher) parts.push(pub.publisher);
    if (pub.pages) parts.push(`pp. ${pub.pages}`);
    if (pub.isbn) parts.push(`ISBN: ${pub.isbn}`);
    return parts.join(', ');
  };

  const formatDOILink = (doi: string) => `https://doi.org/${doi}`;

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Publications"
        title="Publications"
        lead="Peer-reviewed journal articles, book chapters, and conference proceedings from our laboratory."
        aside={
          <div>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border bg-border shadow-[0_10px_40px_-16px_hsl(var(--shadow-color)/0.25)]" aria-label="Research impact">
              {[
                { label: 'Publications', value: publications.length },
                { label: 'Citations', value: displayedCitations },
                { label: 'h-index', value: displayedHIndex },
              ].map((m) => (
                <div key={m.label} className="bg-card/95 p-4 sm:p-6">
                  <dt className="meta">{m.label}</dt>
                  <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-4xl">{m.value}</dd>
                </div>
              ))}
            </dl>
            {(metrics.sourceName || metrics.sourceUrl || metrics.lastUpdated) && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                <span>Source: </span>
                {metrics.sourceUrl ? (
                  <a
                    href={metrics.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    {metrics.sourceName || metrics.sourceUrl}
                  </a>
                ) : (
                  <span>{metrics.sourceName}</span>
                )}
                {metrics.lastUpdated && (
                  <span> · Updated {new Date(metrics.lastUpdated).toLocaleDateString('en-GB')}</span>
                )}
              </p>
            )}
          </div>
        }
      />

      <div className="container mx-auto px-4 pb-8 pt-8 sm:px-6 sm:pb-10 sm:pt-10">
        {/* Toolbar: search + type filter */}
        <div className="panel p-4 sm:p-5" role="search" aria-label="Search and filter publications">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                placeholder="Search by title, author, journal..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && searchQuery) {
                    e.preventDefault();
                    setSearchQuery('');
                  }
                }}
                className="h-11 rounded-full bg-background pl-9 pr-11 [&::-webkit-search-cancel-button]:hidden"
                aria-label="Search publications"
                type="search"
                enterKeyHint="search"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchRef.current?.focus();
                  }}
                  className="pressable absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by publication type">
              {TYPE_FILTERS.map((filter) => {
                const active = selectedType === filter.value;
                const count = typeCounts[filter.value];
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => {
                      setSelectedType(filter.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    aria-pressed={active}
                    disabled={!active && count === 0}
                    className={cn(
                      'pressable inline-flex min-h-[36px] items-center rounded-full border px-3.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40',
                      active
                        ? 'glass-prominent border-transparent bg-primary text-primary-foreground'
                        : 'bg-card text-foreground/80 hover:border-primary/40'
                    )}
                  >
                    <span className="hidden md:inline">{filter.label}</span>
                    <span className="md:hidden">{filter.shortLabel}</span>
                    <span
                      className={cn('ml-1.5 tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}
                    >
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Year filter: recounted for the search and type; empty years drop out. */}
        <div className="mb-6 mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by year">
          <span className="mr-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Year</span>
          <Button
            size="sm"
            variant={selectedYear === 'all' ? 'outline' : 'ghost'}
            onClick={() => {
              setSelectedYear('all');
              setVisibleCount(PAGE_SIZE);
            }}
            aria-pressed={selectedYear === 'all'}
            className={cn('h-8', selectedYear === 'all' ? 'border-primary/40 text-primary' : 'text-muted-foreground')}
          >
            All Years
            <span className="ml-1 text-[13px]/[17px] tabular-nums opacity-70">({totalForYearChips})</span>
          </Button>
          {visibleYears.map((year) => {
            const active = selectedYear === year;
            return (
              <Button
                key={year}
                size="sm"
                variant={active ? 'outline' : 'ghost'}
                onClick={() => {
                  setSelectedYear(active ? 'all' : year);
                  setVisibleCount(PAGE_SIZE);
                }}
                aria-pressed={active}
                className={cn('h-8 tabular-nums', active ? 'border-primary/40 text-primary' : 'text-muted-foreground')}
              >
                {year}
                <span className="ml-1 text-[13px]/[17px] opacity-70">({yearCounts[year] ?? 0})</span>
              </Button>
            );
          })}
        </div>

        {/* Live result line: always present, announced politely. */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            Showing{' '}
            <span className="font-semibold tabular-nums text-foreground">{filteredPublications.length}</span> of{' '}
            <span className="tabular-nums">{publications.length}</span> publications
            {selectedType !== 'all' &&
              ` · ${selectedType === 'articles' ? 'journal articles' : 'book chapters & proceedings'}`}
            {selectedYear !== 'all' && ` · ${selectedYear}`}
            {deferredQuery.trim() && (
              <>
                {' · matching '}
                <span className="font-medium text-foreground">“{deferredQuery.trim()}”</span>
              </>
            )}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearAll}
              className="pressable inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear all
            </button>
          )}
        </div>

        {filteredPublications.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
            <p className="text-[15px]/[21px] text-muted-foreground sm:text-[17px]/[25px]">
              No publications match {deferredQuery.trim() ? <>“{deferredQuery.trim()}”</> : 'these filters'}
              {selectedYear !== 'all' && <> in {selectedYear}</>}.
            </p>
            {selectedYear !== 'all' && searchMatches.length > 0 && (
              <Button
                variant="outline"
                className="mt-4 rounded-full"
                onClick={() => setSelectedYear('all')}
              >
                Search all years ({searchMatches.filter((e) => typeMatches(e.kind)).length})
              </Button>
            )}
            <Button variant="ghost" className="mt-4 rounded-full" onClick={clearAll}>
              Clear search and filters
            </Button>
          </div>
        ) : (
          <div
            className={cn('space-y-8 transition-opacity duration-150 sm:space-y-10', isStale && 'opacity-60')}
            aria-busy={isStale}
          >
            {sortedYearEntries.map(([year, pubs]) => (
              <section key={year} aria-label={`Publications from ${year}`}>
                <div className="flex items-baseline gap-4 border-b pb-3">
                  <h2 className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{year}</h2>
                  <span className="meta">
                    {pubs.length} {pubs.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <ol className="divide-y" role="list">
                  {pubs.map((pub, index) => {
                    const isArticle = ARTICLE_TYPES.has(pub.type.toLowerCase());
                    const venue = isArticle ? pub.journal : pub.booktitle;
                    const detail = pub.type === 'article' ? formatJournalInfo(pub) : formatBookInfo(pub);
                    return (
                      <li key={`${pub.citationKey}-${index}`} className="py-6">
                        <article className="group">
                          <h3 className="text-[17px]/[25px] font-medium leading-snug sm:text-[19px]/[29px]">
                            {pub.doi ? (
                              <a
                                href={formatDOILink(pub.doi)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-4 hover:underline"
                              >
                                <Highlight text={pub.title} terms={terms} />
                              </a>
                            ) : (
                              <Highlight text={pub.title} terms={terms} />
                            )}
                          </h3>
                          <div className="mt-2 space-y-1.5 sm:pl-6">
                            <p className="text-[15px]/[21px] text-muted-foreground">
                              <Highlight text={formatAuthors(pub.author)} terms={terms} />
                            </p>
                            <p className="text-[15px]/[21px] text-muted-foreground">
                              {venue && (
                                <em>
                                  {!isArticle && pub.booktitle && 'In: '}
                                  <Highlight text={venue} terms={terms} />
                                </em>
                              )}
                              {venue && detail && <span>, </span>}
                              {detail && <span>{detail}</span>}
                            </p>
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                              <span className="tabular-nums">{pub.year}</span>
                              <span aria-hidden="true">·</span>
                              <span>{isArticle ? 'Journal Article' : 'Book Chapter'}</span>
                              {pub.doi && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <a
                                    href={formatDOILink(pub.doi)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Open DOI ${pub.doi} in a new tab`}
                                    className="inline-flex items-center gap-1 normal-case tracking-normal text-primary underline-offset-4 hover:underline"
                                  >
                                    <span className="break-all">doi:{pub.doi}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  </a>
                                </>
                              )}
                            </p>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {filteredPublications.length > visibleCount && (
              <div className="flex flex-col items-center gap-3 border-t pt-7">
                <p className="text-sm text-muted-foreground">
                  Showing {visibleCount} of {filteredPublications.length} publications
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                >
                  Show more publications
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Lower-case, accent-free text, so "Mukherjee" finds "Mukhérjee" and vice versa. */
function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Marks the search terms inside a piece of text. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!text || terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[3px] bg-[hsl(var(--coral)/0.28)] px-0.5 text-inherit dark:bg-[hsl(var(--coral)/0.35)]">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

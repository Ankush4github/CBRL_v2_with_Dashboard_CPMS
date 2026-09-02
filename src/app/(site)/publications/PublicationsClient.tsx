'use client';

import { useEffect, useState, useMemo } from 'react';
import { Search, ExternalLink } from 'lucide-react';
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

  // Precompute normalized search terms (only when searchQuery changes)
  const searchTerms = useMemo(
    () => searchQuery.toLowerCase().split(' ').filter((term) => term.length > 0),
    [searchQuery]
  );

  // Precompute type counts (only when publications change)
  const typeCounts = useMemo(() => {
    let articles = 0;
    let chapters = 0;

    for (const pub of publications) {
      const type = pub.type.toLowerCase();
      if (ARTICLE_TYPES.has(type)) {
        articles++;
      } else if (CHAPTER_TYPES.has(type)) {
        chapters++;
      }
    }

    return { articles, chapters, all: publications.length };
  }, [publications]);

  // Precompute year counts based on selected type filter
  const yearCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const pub of publications) {
      // Apply type filter
      if (selectedType !== 'all') {
        const type = pub.type.toLowerCase();
        if (selectedType === 'articles' && !ARTICLE_TYPES.has(type)) continue;
        if (selectedType === 'chapters' && !CHAPTER_TYPES.has(type)) continue;
      }

      const year = typeof pub.year === 'string' ? parseInt(pub.year, 10) : pub.year;
      counts[year] = (counts[year] || 0) + 1;
    }
    return counts;
  }, [publications, selectedType]);

  // Get unique years sorted descending
  const allYears = useMemo(
    () => Object.keys(yearCounts).map(Number).sort((a, b) => b - a),
    [yearCounts]
  );

  // Optimized filtering with useMemo
  const filteredPublications = useMemo(() => {
    return publications.filter((pub) => {
      // Year matching (fast check first)
      if (selectedYear !== 'all') {
        const pubYear = typeof pub.year === 'string' ? parseInt(pub.year, 10) : pub.year;
        if (pubYear !== selectedYear) return false;
      }

      // Type matching
      if (selectedType !== 'all') {
        const type = pub.type.toLowerCase();
        if (selectedType === 'articles' && !ARTICLE_TYPES.has(type)) return false;
        if (selectedType === 'chapters' && !CHAPTER_TYPES.has(type)) return false;
      }

      // Search matching (most expensive, do last)
      if (searchTerms.length > 0) {
        const searchableText = [
          pub.title,
          pub.author,
          pub.journal,
          pub.booktitle,
          pub.publisher,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        for (const term of searchTerms) {
          if (!searchableText.includes(term)) return false;
        }
      }

      return true;
    });
  }, [publications, selectedYear, selectedType, searchTerms]);

  // Group publications by year (only when filteredPublications change)
  const publicationsByYear = useMemo(() => {
    const grouped: Record<number, Publication[]> = {};
    for (const pub of filteredPublications) {
      const year = typeof pub.year === 'string' ? parseInt(pub.year, 10) : pub.year;
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(pub);
    }
    return grouped;
  }, [filteredPublications]);

  // Sorted year entries for rendering
  const sortedYearEntries = useMemo(
    () =>
      Object.entries(publicationsByYear).sort(
        ([yearA], [yearB]) => Number(yearB) - Number(yearA)
      ),
    [publicationsByYear]
  );

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

  const formatDOILink = (doi: string) => {
    return `https://doi.org/${doi}`;
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Scholarly Output"
        title="Publications"
        lead="Peer-reviewed journal articles, book chapters, and conference proceedings from our laboratory."
      />

      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
        {/* Research Impact metrics */}
        <section className="mb-10 sm:mb-14" aria-label="Research impact">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Research Impact
          </p>
          <div className="grid grid-cols-3 divide-x border-y">
            <div className="px-4 py-6 sm:px-8">
              <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
                {publications.length}
              </p>
              <p className="mt-1.5 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Publications
              </p>
            </div>
            <div className="px-4 py-6 sm:px-8">
              <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
                {displayedCitations}
              </p>
              <p className="mt-1.5 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Total Citations
              </p>
            </div>
            <div className="px-4 py-6 sm:px-8">
              <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
                {displayedHIndex}
              </p>
              <p className="mt-1.5 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                h-index
              </p>
            </div>
          </div>
          {(metrics.sourceName || metrics.sourceUrl || metrics.lastUpdated) && (
            <p className="mt-3 text-[13px]/[17px] text-muted-foreground">
              <span>Source: </span>
              {metrics.sourceUrl ? (
                <a
                  href={metrics.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:underline hover:text-foreground transition-colors"
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
        </section>

        {/* Toolbar: search + type filter */}
        <div className="border-y py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="text"
                placeholder="Search by title, author, journal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.trim())}
                className="pl-9"
                aria-label="Search publications"
              />
            </div>
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2"
              role="group"
              aria-label="Filter by publication type"
            >
              {TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setSelectedType(filter.value)}
                  aria-pressed={selectedType === filter.value}
                  className={cn(
                    'text-[15px]/[21px] font-medium transition-colors underline-offset-8',
                    selectedType === filter.value
                      ? 'text-foreground underline decoration-primary decoration-2'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="hidden md:inline">{filter.label}</span>
                  <span className="md:hidden">{filter.shortLabel}</span>
                  <span className="ml-1.5 text-[13px]/[17px] text-muted-foreground tabular-nums">
                    ({typeCounts[filter.value]})
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Year filter */}
        <div
          className="mt-4 mb-10 sm:mb-12 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by year"
        >
          <span className="mr-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Year
          </span>
          <Button
            size="sm"
            variant={selectedYear === 'all' ? 'outline' : 'ghost'}
            onClick={() => setSelectedYear('all')}
            aria-pressed={selectedYear === 'all'}
            className={cn(
              'h-8',
              selectedYear === 'all' ? 'border-primary/40 text-primary' : 'text-muted-foreground'
            )}
          >
            All Years
          </Button>
          {allYears.map((year) => (
            <Button
              key={year}
              size="sm"
              variant={selectedYear === year ? 'outline' : 'ghost'}
              onClick={() => setSelectedYear(year)}
              aria-pressed={selectedYear === year}
              className={cn(
                'h-8 tabular-nums',
                selectedYear === year ? 'border-primary/40 text-primary' : 'text-muted-foreground'
              )}
            >
              {year}
              <span className="ml-1 text-[13px]/[17px] opacity-70">({yearCounts[year]})</span>
            </Button>
          ))}
        </div>

        {/* Search results count */}
        {searchQuery && (
          <p className="mb-8 text-[13px]/[17px] sm:text-[15px]/[21px] text-muted-foreground" aria-live="polite">
            Found {filteredPublications.length}{' '}
            {filteredPublications.length === 1 ? 'publication' : 'publications'}
            {selectedType !== 'all' &&
              ` in ${selectedType === 'articles' ? 'Journal Articles' : 'Book Chapters & Proceedings'}`}
            {selectedYear !== 'all' && ` from ${selectedYear}`}
            {` matching "${searchQuery}"`}
          </p>
        )}

        {filteredPublications.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-16 text-center">
            <p className="text-[15px]/[21px] sm:text-[17px]/[25px] text-muted-foreground">
              No publications found matching your criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-12 sm:space-y-16">
            {sortedYearEntries.map(([year, pubs]) => (
              <section key={year} aria-label={`Publications from ${year}`}>
                <div className="flex items-baseline gap-4 border-b pb-3">
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums">
                    {year}
                  </h2>
                  <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                    {pubs.length} {pubs.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <ol className="divide-y" role="list">
                  {pubs.map((pub, index) => {
                    const isArticle = ARTICLE_TYPES.has(pub.type.toLowerCase());
                    const venue = isArticle ? pub.journal : pub.booktitle;
                    const detail =
                      pub.type === 'article' ? formatJournalInfo(pub) : formatBookInfo(pub);
                    return (
                      <li key={`${pub.citationKey}-${index}`} className="py-6">
                        <article className="group">
                          <h3 className="text-[17px]/[25px] sm:text-[19px]/[29px] font-medium leading-snug">
                            {pub.doi ? (
                              <a
                                href={formatDOILink(pub.doi)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-4 hover:underline"
                              >
                                {pub.title}
                              </a>
                            ) : (
                              pub.title
                            )}
                          </h3>
                          <div className="mt-2 space-y-1.5 sm:pl-6">
                            <p className="text-[15px]/[21px] text-muted-foreground">
                              {formatAuthors(pub.author)}
                            </p>
                            <p className="text-[15px]/[21px] text-muted-foreground">
                              {venue && (
                                <em>{!isArticle && pub.booktitle ? `In: ${venue}` : venue}</em>
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
          </div>
        )}
      </div>
    </div>
  );
}

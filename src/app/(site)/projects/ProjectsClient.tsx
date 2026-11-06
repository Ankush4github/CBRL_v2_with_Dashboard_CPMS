'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Banknote, Calendar, ExternalLink, FileText, UserRound, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Project, ProjectsContent } from '@/lib/content-types';
import { formatPeriod, funderShort, projectAnchor } from '@/lib/research-links';
import { cn } from '@/lib/utils';

export interface ProjectAreaTag {
  id: string;
  title: string;
}

function Meta({ project }: { project: Project }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="meta flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Period
        </dt>
        <dd className="mt-1 font-medium text-foreground">{formatPeriod(project.duration)}</dd>
      </div>
      <div>
        <dt className="meta flex items-center gap-1.5">
          <Banknote className="h-3.5 w-3.5" aria-hidden="true" /> Funded
        </dt>
        <dd className="mt-1 font-medium text-foreground">{project.funding}</dd>
      </div>
      <div>
        <dt className="meta flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Lab&apos;s role
        </dt>
        <dd className="mt-1 font-medium text-foreground">{project.role}</dd>
      </div>
    </dl>
  );
}

function ProjectDialog({
  project,
  area,
  onClose,
}: {
  project: Project | null;
  area?: ProjectAreaTag;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl p-6 sm:rounded-3xl sm:p-10">
        {project && (
          <>
            <DialogHeader className="text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Ongoing
                </span>
                {area && <span className="chip py-0.5 text-[11px]">{area.title}</span>}
              </div>
              <DialogTitle className="mt-4 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                {project.title}
              </DialogTitle>
              <DialogDescription className="pt-2 text-left text-base leading-relaxed">
                {project.shortDescription}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 rounded-2xl border bg-muted/40 p-5">
              <Meta project={project} />
            </div>

            <div className="mt-8 space-y-8">
              {project.detailedDescription && (
                <section>
                  <h3 className="eyebrow-plain">Overview</h3>
                  <p className="mt-3 leading-relaxed text-foreground/90">{project.detailedDescription}</p>
                </section>
              )}
              {project.objectives.length > 0 && (
                <section>
                  <h3 className="eyebrow-plain">Objectives</h3>
                  <ol className="mt-3 space-y-3">
                    {project.objectives.map((objective, i) => (
                      <li key={i} className="flex gap-3 leading-relaxed text-foreground/90">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                          {i + 1}
                        </span>
                        {objective}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {project.methodology && (
                <section>
                  <h3 className="eyebrow-plain">Research approach</h3>
                  <p className="mt-3 leading-relaxed text-foreground/90">{project.methodology}</p>
                </section>
              )}
              {project.expectedOutcomes && (
                <section>
                  <h3 className="eyebrow-plain">Expected outcomes</h3>
                  <p className="mt-3 leading-relaxed text-foreground/90">{project.expectedOutcomes}</p>
                </section>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'pressable min-h-[36px] rounded-full border px-3.5 text-xs font-semibold transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground/80 hover:border-primary/40'
      )}
    >
      {children}
    </button>
  );
}

export default function ProjectsClient({
  ongoing,
  completedPdf,
  completedCount,
  sponsors,
  areas,
}: ProjectsContent & { areas: Record<number, ProjectAreaTag | undefined> }) {
  const [selected, setSelected] = useState<Project | null>(null);
  const [area, setArea] = useState('all');
  const [funder, setFunder] = useState('all');

  const areaOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of ongoing) {
      const a = areas[p.id];
      if (a) seen.set(a.id, a.title);
    }
    return [...seen.entries()];
  }, [ongoing, areas]);

  const funderOptions = useMemo(() => [...new Set(ongoing.map((p) => funderShort(p.funding)))], [ongoing]);

  const visible = ongoing.filter(
    (p) => (area === 'all' || areas[p.id]?.id === area) && (funder === 'all' || funderShort(p.funding) === funder)
  );

  useEffect(() => {
    const open = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const match = ongoing.find((p) => projectAnchor(p) === hash);
      if (match) setSelected(match);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [ongoing]);

  const close = () => {
    setSelected(null);
    if (window.location.hash.startsWith('#project-')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  return (
    <div className="bg-background">
      <PageHeader
        eyebrow="Projects"
        title="Research projects"
        lead="Our funded research programmes span women's health and respiratory disorders, applying multi-omics and machine learning to real clinical challenges."
        aside={
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-[0_10px_40px_-16px_hsl(var(--shadow-color)/0.25)]">
            <div className="bg-card/95 p-5 sm:p-6">
              <dt className="meta">Ongoing projects</dt>
              <dd className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">{ongoing.length}</dd>
            </div>
            <div className="bg-card/95 p-5 sm:p-6">
              <dt className="meta">Completed projects</dt>
              <dd className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">
                <a href="#completed" className="underline-offset-4 transition-colors hover:text-primary hover:underline">
                  {completedCount}
                </a>
              </dd>
            </div>
          </dl>
        }
      />

      <section className="section" aria-labelledby="ongoing-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">Ongoing</p>
              <h2 id="ongoing-heading" className="display-2 mt-4">Current funded research</h2>
            </div>
            <a href="#completed" className="link-arrow">
              Completed projects <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="mt-8 flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5">
            {areaOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by research area">
                <span className="meta w-20 shrink-0">Area</span>
                <FilterChip active={area === 'all'} onClick={() => setArea('all')}>All areas</FilterChip>
                {areaOptions.map(([id, title]) => (
                  <FilterChip key={id} active={area === id} onClick={() => setArea(id)}>
                    {title}
                  </FilterChip>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by funding agency">
              <span className="meta w-20 shrink-0">Funded</span>
              <FilterChip active={funder === 'all'} onClick={() => setFunder('all')}>All funders</FilterChip>
              {funderOptions.map((f) => (
                <FilterChip key={f} active={funder === f} onClick={() => setFunder(f)}>
                  {f}
                </FilterChip>
              ))}
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            Showing {visible.length} of {ongoing.length} ongoing {ongoing.length === 1 ? 'project' : 'projects'}
          </p>

          {visible.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed p-12 text-center">
              <p className="text-muted-foreground">No projects match these filters.</p>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => {
                  setArea('all');
                  setFunder('all');
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" /> Clear filters
              </Button>
            </div>
          ) : (
            <ul className="mt-8 grid gap-6 md:grid-cols-2">
              {visible.map((project) => {
                const a = areas[project.id];
                return (
                  <li key={project.id} id={projectAnchor(project)} className="scroll-mt-28">
                    <article className="panel panel-hover flex h-full flex-col p-6 sm:p-8">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                          Ongoing
                        </span>
                        {a && <span className="chip py-0.5 text-[11px]">{a.title}</span>}
                        <span className="chip py-0.5 text-[11px]">{funderShort(project.funding)}</span>
                      </div>
                      <h3 className="mt-5 text-xl font-semibold leading-snug tracking-tight">{project.title}</h3>
                      <p className="mb-6 mt-3 leading-relaxed text-muted-foreground">{project.shortDescription}</p>
                      <div className="mt-auto border-t pt-5">
                        <Meta project={project} />
                        <Button
                          variant="outline"
                          className="mt-6 rounded-full"
                          onClick={() => setSelected(project)}
                          aria-haspopup="dialog"
                        >
                          View project<span className="sr-only">: {project.title}</span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section id="completed" className="section-tint scroll-mt-28 border-t py-10 sm:py-12" aria-labelledby="completed-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="panel flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div className="flex gap-5">
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary sm:flex">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Archive</p>
                <h2 id="completed-heading" className="mt-3 text-2xl font-semibold tracking-tight">Completed projects</h2>
                <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">
                  The full list of the lab&apos;s completed research projects is maintained as a document.
                </p>
              </div>
            </div>
            {completedPdf && (
              <Button asChild size="lg" className="shrink-0 rounded-full">
                <a href={completedPdf} target="_blank" rel="noopener noreferrer">
                  View completed projects (PDF)
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </section>

      {sponsors.length > 0 && (
        <section className="section border-t" aria-labelledby="sponsors-heading">
          <div className="container mx-auto px-4 sm:px-6">
            <p className="eyebrow">Funding partners</p>
            <h2 id="sponsors-heading" className="display-2 mt-4">Sponsors of our ongoing projects</h2>
            <ul className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-4">
              {sponsors.map((sponsor) => (
                <li
                  key={sponsor.src}
                  className="panel flex h-28 items-center justify-center p-6 sm:h-32"
                >
                  <Image
                    src={sponsor.src}
                    alt={sponsor.alt}
                    width={sponsor.width}
                    height={sponsor.height}
                    sizes="(max-width: 768px) 50vw, 180px"
                    style={{ width: '100%', height: 'auto' }}
                    className="max-h-full object-contain dark:invert"
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <ProjectDialog project={selected} area={selected ? areas[selected.id] : undefined} onClose={close} />
    </div>
  );
}

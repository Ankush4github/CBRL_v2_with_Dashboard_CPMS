'use client';

import Image from 'next/image';
import { Banknote, Calendar, UserRound, ArrowRight, FileText, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Project, ProjectsContent } from '@/lib/content-types';

function ProjectRow({ project, index }: { project: Project; index: number }) {
  return (
    <article className="group py-8 first:pt-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Ongoing
            </Badge>
          </div>
          <h3 className="mt-3 text-lg font-medium tracking-tight text-foreground">
            {project.title}
          </h3>
          <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
            {project.shortDescription}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {project.duration}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" />
              {project.funding}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {project.role}
            </span>
          </div>
        </div>

        <div className="shrink-0">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                Read More
                <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="tracking-tight">{project.title}</DialogTitle>
                <DialogDescription className="pt-2 text-left leading-relaxed">
                  {project.shortDescription}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {project.duration}
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5" />
                  {project.funding}
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" />
                  {project.role}
                </span>
              </div>

              <Separator />

              <div className="space-y-6">
                <section>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Project Overview
                  </p>
                  <p className="leading-relaxed text-foreground">{project.detailedDescription}</p>
                </section>

                <section>
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Key Objectives
                  </p>
                  <ul className="space-y-2 border-l-2 border-primary/30 pl-6">
                    {project.objectives.map((objective, i) => (
                      <li key={i} className="relative leading-relaxed text-muted-foreground">
                        <span
                          className="absolute -left-[1.72rem] top-2 h-1.5 w-1.5 rounded-full bg-primary/50"
                          aria-hidden="true"
                        />
                        {objective}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Methodology
                  </p>
                  <p className="leading-relaxed text-muted-foreground">{project.methodology}</p>
                </section>

                <section>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Expected Outcomes
                  </p>
                  <p className="leading-relaxed text-muted-foreground">{project.expectedOutcomes}</p>
                </section>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </article>
  );
}

export default function ProjectsClient({ ongoing, completedPdf, sponsors }: ProjectsContent) {
  return (
    <div className="min-h-screen bg-background">
      {/* Editorial Header */}
      <PageHeader
        eyebrow="Funded Research Register"
        title="Research Projects"
        lead="Our funded research programmes span women's health and respiratory disorders, applying multi-omics and machine learning to real clinical challenges."
      />

      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <Tabs defaultValue="ongoing" className="w-full">
            <TabsList>
              <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>

            <TabsContent value="ongoing" className="mt-8">
              <div className="divide-y border-t">
                {ongoing.map((project, index) => (
                  <ProjectRow key={project.id} project={project} index={index} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="mt-8">
              <div className="rounded-lg border bg-card p-10 shadow-none">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Archive
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Completed Projects</h2>
                <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                  View the full list of our completed research projects.
                </p>
                <Button asChild variant="outline" className="mt-6">
                  <a
                    href={completedPdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View completed projects document (opens in new tab)"
                  >
                    <FileText className="h-4 w-4" />
                    View Completed Projects list
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Sponsors Section */}
          <section className="mt-20 border-t pt-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Funding Partners
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Sponsors of our ongoing projects
            </h2>
            <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
              {sponsors.map((sponsor) => (
                <div
                  key={sponsor.src}
                  className="flex h-24 items-center justify-center rounded-lg border bg-card p-6 shadow-none transition-colors hover:border-primary/40 sm:h-28 md:h-32"
                >
                  <Image
                    src={sponsor.src}
                    alt={sponsor.alt}
                    width={sponsor.width}
                    height={sponsor.height}
                    sizes="(max-width: 768px) 50vw, 180px"
                    style={{ width: '100%', height: 'auto' }}
                    className="max-h-full object-contain opacity-80 transition-opacity hover:opacity-100 dark:invert"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

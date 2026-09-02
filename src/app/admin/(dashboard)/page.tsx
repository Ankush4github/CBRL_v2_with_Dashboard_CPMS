import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import {
  getAbout,
  getFacilities,
  getGallery,
  getHome,
  getMembers,
  getMetrics,
  getProjects,
  getResearch,
  readPublicationsFile,
} from '@/lib/content';
import { splitEntries } from '@/lib/bibtex-entries';
import { MEMBER_GROUPS, MEMBER_GROUP_LABELS } from '@/lib/content-types';
import { adminNav } from '@/components/admin/nav';
import { AdminPageHeader } from '@/components/admin/EditorChrome';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const [home, members, projects, research, gallery, facilities, about, metrics, bibtex] =
    await Promise.all([
      getHome(),
      getMembers(),
      getProjects(),
      getResearch(),
      getGallery(),
      getFacilities(),
      getAbout(),
      getMetrics(),
      readPublicationsFile(),
    ]);

  const publications = splitEntries(bibtex);
  const currentMembers = MEMBER_GROUPS.filter((g) => g !== 'alumni').reduce(
    (total, group) => total + members[group].length,
    0
  );

  const counts: Record<string, string> = {
    '/admin/home': `${home.hero.slides.length} hero images · ${home.collaborators.length} collaborators`,
    '/admin/members': `${currentMembers} current · ${members.alumni.length} alumni`,
    '/admin/publications': `${publications.length} entries`,
    '/admin/projects': `${projects.ongoing.length} ongoing · ${projects.sponsors.length} sponsors`,
    '/admin/research': `${research.areas.length} areas · ${research.areas.reduce((n, a) => n + a.topics.length, 0)} topics`,
    '/admin/gallery': `${gallery.albums.length} albums · ${gallery.categories.length} categories`,
    '/admin/facilities': `${facilities.instruments.length} instruments · ${facilities.charges.length} charge rows`,
    '/admin/about': `${about.biography.paragraphs.length} biography paragraphs · ${about.awards.items.length} awards`,
    '/admin/metrics': metrics ? `${metrics.totalCitations} citations · h-index ${metrics.hIndex}` : 'Not set',
  };

  const stats = [
    { value: String(publications.length), label: 'Publications' },
    { value: String(currentMembers), label: 'Current members' },
    { value: String(projects.ongoing.length), label: 'Ongoing projects' },
    { value: String(gallery.albums.length), label: 'Gallery albums' },
  ];

  const sections = adminNav.filter((item) => item.href !== '/admin');

  return (
    <div className="pb-16">
      <AdminPageHeader
        eyebrow="Overview"
        title="Website content"
        lead="Everything here writes straight to the live site. A saved change appears on cbrl.iitkgp.ac.in immediately — no rebuild or redeploy."
      />

      {/* 1px gaps over a border-coloured background rather than divide-x/divide-y,
          which add border-left and border-top to every child after the first —
          correct for one row, wrong for two. At grid-cols-2 that put a top
          border on the second cell (already in row 1) and a left border on the
          third (already at the grid's edge); `first:border-l-0` only ever fixed
          the first cell. This is the same technique as "People by group" below. */}
      <section className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-background px-4 py-8">
            <div className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {stat.value}
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </section>

      <section className="py-10">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Sections
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col rounded-lg border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                {item.label}
              </h2>
              {/* flex-1 so the description absorbs the leftover height: the grid
                  stretches every card in a row to the tallest, and without this
                  a one-line description leaves the divider and count floating
                  mid-card while its two-line neighbours sit lower. */}
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {counts[item.href]}
                </span>
                <ArrowRight
                  className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Team</p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">People by group</h2>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
          {MEMBER_GROUPS.map((group) => (
            <div key={group} className="bg-card px-4 py-5">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {MEMBER_GROUP_LABELS[group]}
              </dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                {members[group].length}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border bg-muted/30 p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Good to know
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            Every save keeps the previous 20 versions of each section in{' '}
            <code className="font-mono text-xs">site_content_versions</code>, so a mistake can be
            undone.
          </li>
          <li>
            Content lives in the database, not in the deployed files — a release can no longer
            overwrite an edit made here, and there is nothing to commit back to git afterwards.
          </li>
          <li>
            Images are uploaded to the <code className="font-mono text-xs">site-media</code> store
            and given a content-hashed name, so replacing a photo never leaves the old one cached.
          </li>
        </ul>
      </section>
    </div>
  );
}

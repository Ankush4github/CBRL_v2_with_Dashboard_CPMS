'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Mail, Phone, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  MEMBER_GROUP_LABELS,
  type Member,
  type MemberGroup,
  type MembersContent,
} from '@/lib/content-types';
import { memberImage, memberImageAlt, profilePath, researchAreas } from '@/lib/member-profile';
import { PROFILE_META } from './member-links';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function initials(name: string) {
  return name
    .replace(/^(Dr|Prof)\.?\s+/i, '')
    .replace(/,.*$/, '')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function joined(dateString?: string) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function emails(member: Member) {
  return member.email.split(',').map((e) => e.trim()).filter(Boolean);
}

/** Everything a visitor might type to find someone. */
function searchText(member: Member) {
  return [
    member.name,
    member.title,
    member.research,
    member.bio,
    member.responsibilities,
    member.currentPosition,
    member.thesisTitle,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function Portrait({
  member,
  sizes,
  priority,
  className,
}: {
  member: Member;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const src = memberImage(member);
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-accent to-muted', className)}>
      {src ? (
        <Image
          src={src}
          alt={memberImageAlt(member)}
          fill
          sizes={sizes}
          priority={priority}
          quality={75}
          className="object-cover object-[50%_25%] transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-primary/40">{initials(member.name)}</span>
        </div>
      )}
    </div>
  );
}

/** Small icon links: email and academic profiles, each with an accessible name. */
function IconLinks({ member }: { member: Member }) {
  const profiles = Object.entries(member.profiles ?? {}).filter(
    (entry): entry is [string, string] => Boolean(entry[1])
  );
  const first = emails(member)[0];
  const cls =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary';
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {first && (
        <li>
          <a href={`mailto:${first}`} className={cls} title={first}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Email {member.name.trim()}</span>
          </a>
        </li>
      )}
      {profiles.map(([key, url]) => {
        const meta = PROFILE_META[key];
        if (!meta) return null;
        return (
          <li key={key}>
            <a href={url} target="_blank" rel="noopener noreferrer" className={cls} title={meta.label}>
              <meta.Icon className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">
                {member.name.trim()} on {meta.label} (opens in a new tab)
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Principal investigator                                             */
/* ------------------------------------------------------------------ */

/** One row of the faculty card's contact panel: icon tile, label, value. */
function ContactRow({
  icon: Icon,
  label,
  href,
  children,
}: {
  icon: typeof Mail;
  label: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className="group/row flex items-center gap-2.5 text-sm text-foreground/85 transition-colors hover:text-primary"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card text-primary transition-colors group-hover/row:border-primary/40">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 break-all">
          <span className="sr-only">{label}: </span>
          {children}
        </span>
      </a>
    </li>
  );
}

function PiFeature({ member }: { member: Member }) {
  const areas = researchAreas(member);
  const href = profilePath(member, 'faculty');
  const name = member.name.trim();
  const mails = emails(member);
  const profiles = Object.entries(member.profiles ?? {}).filter(
    (entry): entry is [string, string] => Boolean(entry[1]) && Boolean(PROFILE_META[entry[0]])
  );

  return (
    <article id={member.id} className="panel group scroll-mt-28 overflow-hidden">
      <div className="grid lg:grid-cols-12">
        <div className="relative lg:col-span-4">
          <Portrait
            member={member}
            priority
            sizes="(max-width: 1024px) 100vw, 33vw"
            className="aspect-[4/3] h-full sm:aspect-[16/9] lg:aspect-auto lg:min-h-[22rem]"
          />
        </div>

        <div className="relative flex flex-col p-5 sm:p-7 lg:col-span-8 lg:p-8">
          {/* A faint brand wash in the corner, behind the text */}
          <div
            className="pointer-events-none absolute right-0 top-0 h-44 w-60 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.07),transparent)]"
            aria-hidden="true"
          />

          <p className="eyebrow relative">Faculty · IIT Kharagpur</p>
          <h3 className="relative mt-2.5 text-2xl font-semibold leading-tight tracking-[-0.015em] text-balance sm:text-[1.75rem]">
            <Link href={href} className="underline-offset-4 transition-colors hover:text-primary hover:underline">
              {name}
            </Link>
          </h3>
          <div className="relative mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-primary">{member.title}</p>
            <span className="h-px w-5 bg-[hsl(var(--coral))]" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">School of Medical Science and Technology</p>
          </div>

          {member.bio && (
            <p className="relative mt-4 max-w-prose text-sm leading-6 text-foreground/80">{member.bio}</p>
          )}

          {areas.length > 0 && (
            <div className="relative mt-4">
              <p className="meta">Research interests</p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Research interests">
                {areas.map((a) => (
                  <li
                    key={a}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-foreground/85 transition-colors hover:border-primary/40"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--coral))]" aria-hidden="true" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="relative mt-5 grid gap-4 rounded-xl border bg-muted/50 p-4 sm:grid-cols-2">
            <div>
              <p className="meta">Contact</p>
              <ul className="mt-2.5 space-y-2">
                {mails.map((mail) => (
                  <ContactRow key={mail} icon={Mail} label="Email" href={`mailto:${mail}`}>
                    {mail}
                  </ContactRow>
                ))}
                {member.phone && (
                  <ContactRow icon={Phone} label="Phone" href={`tel:${member.phone.replace(/[^\d+]/g, '')}`}>
                    {member.phone}
                  </ContactRow>
                )}
              </ul>
            </div>
            {profiles.length > 0 && (
              <div>
                <p className="meta">Academic profiles</p>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {profiles.map(([key, url]) => {
                    const meta = PROFILE_META[key];
                    return (
                      <li key={key}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pressable inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          <meta.Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          {meta.label}
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2.5">
            <Button asChild size="sm" className="rounded-full px-5">
              <Link href={href}>
                Full profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            {mails[0] && (
              <Button asChild size="sm" variant="outline" className="rounded-full bg-card px-5">
                <a href={`mailto:${mails[0]}`}>
                  <Mail className="h-4 w-4" aria-hidden="true" /> Email {name.replace(/^(Professor|Prof\.?|Dr\.?)\s+/i, '').split(/[\s,]+/)[0]}
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Current members                                                    */
/* ------------------------------------------------------------------ */

function MemberCard({ member, group, priority }: { member: Member; group: MemberGroup; priority?: boolean }) {
  const href = profilePath(member, group);
  const since = joined(member.joinedDate);
  const focus = member.research?.trim() || member.responsibilities?.trim();

  return (
    <article id={member.id} className="panel panel-hover group flex h-full scroll-mt-28 flex-col overflow-hidden">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
        <Portrait
          member={member}
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="aspect-[4/5]"
        />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="meta text-primary">{member.title}</p>
        <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight">
          <Link href={href} className="underline-offset-4 hover:text-primary hover:underline">
            {member.name.trim()}
          </Link>
        </h3>
        {since && <p className="mt-1 text-xs text-muted-foreground">With CBRL since {since}</p>}
        {focus && (
          <div className="mt-4 border-l-2 border-[hsl(var(--coral))] pl-3">
            <p className="meta">{member.research?.trim() ? 'Research' : 'Role'}</p>
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground/85">{focus}</p>
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <IconLinks member={member} />
          <Link href={href} className="link-arrow shrink-0 text-[13px]">
            Profile
            <span className="sr-only">: {member.name.trim()}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Alumni                                                             */
/* ------------------------------------------------------------------ */

function AlumniCard({ member }: { member: Member }) {
  const src = memberImage(member);
  const position = member.currentPosition?.trim();
  const thesis = member.thesisTitle?.trim();
  return (
    <article id={member.id} className="flex h-full scroll-mt-28 gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30">
      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-accent">
        {src ? (
          <Image src={src} alt={memberImageAlt(member)} fill sizes="64px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-primary/60">
            {initials(member.name)}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-snug">
          <Link href={profilePath(member, 'alumni')} className="underline-offset-4 hover:text-primary hover:underline">
            {member.name.trim()}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground">{member.title}</p>
        {position && (
          <p className="mt-2 text-sm leading-snug text-foreground/85">
            <span className="meta mr-1.5 normal-case tracking-normal text-primary">Now</span>
            {position}
          </p>
        )}
        {thesis && <p className="mt-1.5 line-clamp-2 text-xs italic leading-relaxed text-muted-foreground">Thesis: {thesis}</p>}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Directory                                                          */
/* ------------------------------------------------------------------ */

const GROUP_INTRO: Record<MemberGroup, string> = {
  faculty: 'Leadership',
  postdocs: 'Researchers',
  students: 'Doctoral researchers',
  staff: 'Operations',
  alumni: 'Former members',
};

const GROUP_TITLE: Record<MemberGroup, string> = {
  ...MEMBER_GROUP_LABELS,
  staff: 'Lab Staff & Project Fellows',
};

type Filter = 'all' | MemberGroup;

/**
 * The team, grouped as the dashboard groups it. Every card is in the server
 * HTML; the group chips and the search only hide cards, so anchors such as
 * /members#palash-paul and every profile link keep working without
 * JavaScript.
 */
export default function TeamDirectory({ members }: { members: MembersContent }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Filtering from far down the page would otherwise leave the results above
  // the viewport, behind the sticky toolbar.
  const revealResults = () => {
    const el = listRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  };

  const groups = (['faculty', 'postdocs', 'students', 'staff', 'alumni'] as const).filter(
    (g) => (members[g]?.length ?? 0) > 0
  );

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const matches = (m: Member) => terms.every((t) => searchText(m).includes(t));

  const visible = (group: MemberGroup) =>
    filter === 'all' || filter === group ? (members[group] ?? []).filter(matches) : [];

  const total = groups.reduce((n, g) => n + visible(g).length, 0);

  return (
    <div>
      {/* Toolbar */}
      {/* A floating Liquid Glass capsule that docks under the header's. */}
      <div className="pointer-events-none sticky top-16 z-30 py-2">
        <div className="container mx-auto px-3 sm:px-6">
        <div className="liquid-glass pointer-events-auto flex flex-col gap-2 rounded-[1.75rem] p-2 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex gap-2 overflow-x-auto rounded-full sm:flex-wrap sm:overflow-visible"
            role="group"
            aria-label="Show team group"
          >
            {(['all', ...groups] as Filter[]).map((g) => {
              const count =
                g === 'all' ? groups.reduce((n, x) => n + members[x].length, 0) : members[g].length;
              const active = filter === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(g);
                    revealResults();
                  }}
                  className={cn(
                    'pressable inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors',
                    active ? 'glass-prominent border-transparent bg-primary text-primary-foreground' : 'border-transparent text-foreground/85 hover:bg-foreground/[0.06]'
                  )}
                >
                  {g === 'all' ? 'Everyone' : GROUP_TITLE[g]}
                  <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                revealResults();
              }}
              placeholder="Search by name or research"
              aria-label="Search the team"
              className="h-10 rounded-full border-transparent bg-card/90 pl-10"
            />
          </div>
        </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {total} {total === 1 ? 'person' : 'people'} shown
      </p>

      <div ref={listRef} className="container mx-auto scroll-mt-44 px-4 py-8 sm:px-6 sm:py-10 lg:scroll-mt-36">
        {total === 0 && (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            <p className="text-muted-foreground">Nobody on the team matches “{query}”.</p>
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Clear search
            </Button>
          </div>
        )}

        {groups.map((group) => {
          const list = visible(group);
          if (list.length === 0) return null;
          return (
            <section
              key={group}
              id={`group-${group}`}
              aria-labelledby={`group-${group}-title`}
              className="scroll-mt-36 border-t py-8 first:border-t-0 first:pt-0 sm:py-10"
            >
              <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                  <p className="eyebrow">{GROUP_INTRO[group]}</p>
                  <h2 id={`group-${group}-title`} className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {GROUP_TITLE[group]}
                  </h2>
                </div>
                <p className="meta">
                  {list.length} {list.length === 1 ? 'member' : 'members'}
                </p>
              </div>

              {group === 'faculty' ? (
                <div className="grid gap-6">
                  {list.map((m) => (
                    <PiFeature key={m.id} member={m} />
                  ))}
                </div>
              ) : group === 'alumni' ? (
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((m) => (
                    <li key={m.id}>
                      <AlumniCard member={m} />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {list.map((m, i) => (
                    <li key={m.id}>
                      <MemberCard member={m} group={group} priority={group === 'postdocs' && i < 4} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {/* Join */}
        <section className="mt-8 overflow-hidden rounded-[2rem] border bg-gradient-to-br from-accent via-card to-[hsl(var(--coral-soft))] p-8 sm:p-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">Opportunities</p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Join our research team</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We&apos;re always looking for talented researchers and students who are passionate about advancing
                healthcare through biomarker research.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/contact?subject=Research%20opportunities%20at%20CBRL">
                  Get in touch <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full bg-card/70">
                <Link href="/research">
                  Our research <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}


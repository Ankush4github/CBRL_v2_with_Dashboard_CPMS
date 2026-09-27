import Image from 'next/image';
import {
  ExternalLink,
  Globe,
  GraduationCap,
  Linkedin,
  Mail,
  Phone,
  UserRound,
} from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { getMembers } from '@/lib/content';
import type { Member } from '@/lib/content-types';
import MemberFlipCard from './MemberFlipCard';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, '')
    .replace(/,.*$/, '')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatMonthYear(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                             */
/* ------------------------------------------------------------------ */

const PROFILE_META: Record<string, { label: string; Icon: typeof Globe }> = {
  googleScholar: { label: 'Google Scholar', Icon: GraduationCap },
  orcid: { label: 'ORCID', Icon: Globe },
  linkedin: { label: 'LinkedIn', Icon: Linkedin },
  researchgate: { label: 'ResearchGate', Icon: ExternalLink },
};

function ProfileLinks({
  profiles,
  className,
}: {
  profiles: NonNullable<Member['profiles']>;
  className?: string;
}) {
  const entries = Object.entries(profiles).filter(
    (entry): entry is [string, string] => Boolean(entry[1])
  );
  if (entries.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap gap-x-5 gap-y-1.5', className)}>
      {entries.map(([key, url]) => {
        const { label, Icon } = PROFILE_META[key] ?? {
          label: key,
          Icon: ExternalLink,
        };
        return (
          <li key={key}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function EmailLinks({ emails, className }: { emails: string; className?: string }) {
  return (
    <ul className={cn('flex flex-col items-start gap-1.5', className)}>
      {emails.split(',').map((email) => {
        const trimmed = email.trim();
        if (!trimmed) return null;
        return (
          <li key={trimmed}>
            <a
              href={`mailto:${trimmed}`}
              className="inline-flex items-center gap-1.5 break-all text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {trimmed}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function MemberPhoto({
  member,
  sizes,
  priority = false,
  className,
}: {
  member: Member;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {member.image ? (
        <Image
          src={member.image}
          alt={`${member.name.trim()}'s photo`}
          fill
          className="object-cover object-center"
          sizes={sizes}
          priority={priority}
          quality={75}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <UserRound className="h-16 w-16" strokeWidth={1} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-8 sm:mb-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        {eyebrow}
      </p>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {count} {count === 1 ? 'Member' : 'Members'}
        </span>
      </div>
      <Separator className="mt-4" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Featured PI — editorial split profile                              */
/* ------------------------------------------------------------------ */

function FacultyCard({ member }: { member: Member }) {
  const researchAreas = (member.research ?? '')
    .split(',')
    .map((area) => area.trim())
    .filter(Boolean);

  return (
    <article
      id={member.id}
      className="scroll-mt-24 overflow-hidden rounded-lg border bg-card shadow-none transition-colors hover:border-primary/40"
    >
      <div className="grid lg:grid-cols-5">
        <div className="border-b lg:col-span-2 lg:border-b-0 lg:border-r">
          <MemberPhoto
            member={member}
            sizes="(max-width: 1024px) 100vw, 40vw"
            priority
            className="aspect-[4/5] w-full sm:aspect-[3/2] lg:h-full lg:min-h-[26rem] lg:aspect-auto"
          />
        </div>

        <div className="flex flex-col justify-center gap-6 p-6 sm:p-10 lg:col-span-3">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {member.title}
            </p>
            <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {member.name}
            </h3>
            {member.bio && (
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
                {member.bio}
              </p>
            )}
          </div>

          {researchAreas.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Research Areas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {researchAreas.map((area) => (
                  <Badge
                    key={area}
                    variant="outline"
                    className="rounded-full font-normal text-muted-foreground"
                  >
                    {area}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <dl className="space-y-4">
            <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:pt-0.5">
                Email
              </dt>
              <dd>
                <EmailLinks emails={member.email} />
              </dd>
            </div>

            {member.phone && (
              <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:pt-0.5">
                  Phone
                </dt>
                <dd>
                  <a
                    href={`tel:${member.phone}`}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {member.phone}
                  </a>
                </dd>
              </div>
            )}

            {member.profiles && (
              <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:pt-0.5">
                  Academic Profiles
                </dt>
                <dd>
                  <ProfileLinks profiles={member.profiles} />
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Staff card — horizontal editorial directory row                    */
/* ------------------------------------------------------------------ */

function StaffCard({ member }: { member: Member }) {
  return (
    <article
      id={member.id}
      className="h-full scroll-mt-24 overflow-hidden rounded-lg border bg-card shadow-none transition-colors hover:border-primary/40"
    >
      <div className="flex h-full flex-col sm:flex-row">
        {/* Portrait with hairline frame */}
        <div className="border-b sm:w-56 sm:shrink-0 sm:border-b-0 sm:border-r">
          <MemberPhoto
            member={member}
            sizes="(max-width: 640px) 100vw, 224px"
            className="aspect-[4/3] w-full sm:aspect-auto sm:h-full sm:min-h-[13rem]"
          />
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col p-6 sm:p-7">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {member.title}
            {member.joinedDate && (
              <>
                {' '}
                <span aria-hidden="true">&middot;</span> Since{' '}
                {formatMonthYear(member.joinedDate)}
              </>
            )}
          </p>
          <h3 className="mt-1.5 text-lg font-semibold leading-tight tracking-tight">
            {member.name.trim()}
          </h3>

          {member.bio && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {member.bio}
            </p>
          )}

          {member.responsibilities && (
            <div className="mt-4 border-l-2 border-primary/30 pl-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Responsibilities
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {member.responsibilities}
              </p>
            </div>
          )}

          <div className="mt-auto pt-5">
            <Separator className="mb-3" />
            <a
              href={`mailto:${member.email.trim()}`}
              className="inline-flex items-center gap-1.5 break-all text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {member.email.trim()}
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Alumni — compact academic list                                     */
/* ------------------------------------------------------------------ */

function AlumniRow({ member }: { member: Member }) {
  return (
    <article
      id={member.id}
      className="flex h-full scroll-mt-24 gap-5 border-b py-6"
    >
      <Avatar className="h-20 w-20 shrink-0 border">
        {member.image && (
          <AvatarImage
            src={member.image}
            alt={`${member.name.trim()}'s photo`}
            className="object-cover"
          />
        )}
        <AvatarFallback className="text-xl">
          {getInitials(member.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-0.5">
          <h3 className="font-semibold leading-tight tracking-tight">
            {member.name.trim()}
          </h3>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {member.title}
          </p>
        </div>

        {member.currentPosition && member.currentPosition.trim() && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Currently: </span>
            {member.currentPosition.trim()}
          </p>
        )}

        {member.thesisTitle && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium not-italic text-foreground">
              Thesis:{' '}
            </span>
            <span className="italic">{member.thesisTitle}</span>
          </p>
        )}

        <EmailLinks
          emails={member.email}
          className="flex-row flex-wrap gap-x-5"
        />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default async function Members() {
  const members = await getMembers();

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        eyebrow="People"
        title="Lab Members"
        lead="Faculty, researchers, students, staff, and alumni of the Clinical Biomarker Research Laboratory."
      />

      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
        {/* Faculty */}
        <section className="mb-14 sm:mb-20">
          <SectionHeader
            eyebrow="Leadership"
            title="Faculty"
            count={members.faculty.length}
          />
          <div className="grid gap-6 sm:gap-8">
            {members.faculty.map((member) => (
              <FacultyCard key={member.id} member={member} />
            ))}
          </div>
        </section>

        {/* Postdoctoral Fellows */}
        <section className="mb-14 sm:mb-20">
          <SectionHeader
            eyebrow="Researchers"
            title="Postdoctoral Fellows"
            count={members.postdocs.length}
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {members.postdocs.map((member, index) => (
              <MemberFlipCard
                key={member.id}
                member={member}
                anchorId={member.id}
                priority={index < 3}
              />
            ))}
          </div>
        </section>

        {/* Research Scholars */}
        <section className="mb-14 sm:mb-20">
          <SectionHeader
            eyebrow="Doctoral Researchers"
            title="Research Scholars"
            count={members.students.length}
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {members.students.map((member) => (
              <MemberFlipCard
                key={member.id}
                member={member}
                anchorId={member.id}
              />
            ))}
          </div>
        </section>

        {/* Lab Staff / Project Fellow */}
        <section className="mb-14 sm:mb-20">
          <SectionHeader
            eyebrow="Operations"
            title="Lab Staff / Project Fellow"
            count={members.staff.length}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            {members.staff.map((member) => (
              <StaffCard key={member.id} member={member} />
            ))}
          </div>
        </section>

        {/* Alumni */}
        <section>
          <SectionHeader
            eyebrow="Former Members"
            title="Alumni"
            count={members.alumni.length}
          />
          <div className="grid gap-x-12 md:grid-cols-2">
            {members.alumni.map((member, index) => (
              <AlumniRow key={member.id} member={member} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

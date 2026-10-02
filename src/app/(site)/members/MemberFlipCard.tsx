'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Mail, RefreshCw, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Member } from '@/lib/content-types';
import { memberImage, memberImageAlt } from '@/lib/member-profile';
import { PROFILE_META } from './member-links';

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

/** Split the qualifications string into { degree, institution } entries. */
function parseQualifications(text: string) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf(': ');
      if (separatorIndex === -1) {
        return { degree: item.trim(), institution: '' };
      }
      return {
        degree: item.slice(0, separatorIndex).trim(),
        institution: item.slice(separatorIndex + 2).trim(),
      };
    });
}

export default function MemberFlipCard({
  member,
  anchorId,
  profileHref,
  priority = false,
}: {
  member: Member;
  anchorId: string;
  /** The member's own profile page. */
  profileHref: string;
  priority?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);

  const qualifications = member.qualifications
    ? parseQualifications(member.qualifications)
    : [];
  const profileEntries = Object.entries(member.profiles ?? {}).filter(
    (entry): entry is [string, string] => Boolean(entry[1])
  );
  const emails = member.email
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  const toggle = () => setFlipped((value) => !value);

  return (
    <div
      id={anchorId}
      className="flip-card h-[620px] scroll-mt-24"
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${member.name.trim()} — ${
        flipped ? 'hide' : 'show'
      } details`}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      }}
    >
      <div className={cn('flip-card-inner', flipped && 'is-flipped')}>
        {/* Front: photo + identity */}
        <div className="flip-card-front overflow-hidden transition-colors hover:border-primary/40">
          <div className="relative h-96 w-full shrink-0 overflow-hidden border-b bg-muted">
            {memberImage(member) ? (
              <Image
                src={memberImage(member)!}
                alt={memberImageAlt(member)}
                fill
                className="object-cover object-center"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                priority={priority}
                quality={75}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <UserRound className="h-16 w-16" strokeWidth={1} aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3 p-5">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold leading-tight tracking-tight">
                {member.name.trim()}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Badge
                  variant="outline"
                  className="rounded-full font-normal text-muted-foreground"
                >
                  {member.title}
                </Badge>
                {member.joinedDate && (
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span aria-hidden="true">&middot;</span> Joined{' '}
                    {formatDate(member.joinedDate)}
                  </span>
                )}
              </div>
            </div>
            {member.research ? (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Research
                </p>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {member.research.trim()}
                </p>
              </div>
            ) : (
              member.responsibilities && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Role
                  </p>
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {member.responsibilities}
                  </p>
                </div>
              )
            )}
            <p className="mt-auto flex items-center gap-1.5 border-t pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Click to view details
            </p>
          </div>
        </div>

        {/* Back: bio, education, contact */}
        <div className="flip-card-back overflow-hidden">
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {member.title}
              </p>
              <h3 className="text-lg font-semibold leading-tight tracking-tight">
                {member.name.trim()}
              </h3>
            </div>

            {member.bio && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {member.bio}
              </p>
            )}

            {member.responsibilities && (
              <div>
                <Separator className="mb-3" />
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Responsibilities
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {member.responsibilities}
                </p>
              </div>
            )}

            {qualifications.length > 0 && (
              <div>
                <Separator className="mb-3" />
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Education
                </p>
                <ul className="space-y-2">
                  {qualifications.map((qualification, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium leading-snug">
                        {qualification.degree}
                      </p>
                      {qualification.institution && (
                        <p className="text-xs text-muted-foreground">
                          {qualification.institution}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Links must not trigger a flip */}
            <div
              className="mt-auto"
              role="presentation"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Separator className="mb-3" />
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Contact
              </p>
              <ul className="flex flex-col items-start gap-1.5">
                {emails.map((email) => (
                  <li key={email}>
                    <a
                      href={`mailto:${email}`}
                      className="inline-flex items-center gap-1.5 break-all text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {email}
                    </a>
                  </li>
                ))}
              </ul>
              {profileEntries.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                  {profileEntries.map(([key, url]) => {
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
              )}
              {/* The card is one big flip button; this link must navigate
                  without also flipping it on the way out. */}
              <Link
                href={profileHref}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                View full profile of {member.name.trim()}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Click to flip back
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

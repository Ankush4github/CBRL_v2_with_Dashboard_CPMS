/**
 * Contact and academic-profile links for a member, shared by the team list
 * (page.tsx) and each member's own profile page ([id]/page.tsx).
 */

import { ExternalLink, Globe, GraduationCap, Linkedin, Mail } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Member } from '@/lib/content-types';

const PROFILE_META: Record<string, { label: string; Icon: typeof Globe }> = {
  googleScholar: { label: 'Google Scholar', Icon: GraduationCap },
  orcid: { label: 'ORCID', Icon: Globe },
  linkedin: { label: 'LinkedIn', Icon: Linkedin },
  researchgate: { label: 'ResearchGate', Icon: ExternalLink },
};

export function ProfileLinks({
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

export function EmailLinks({ emails, className }: { emails: string; className?: string }) {
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

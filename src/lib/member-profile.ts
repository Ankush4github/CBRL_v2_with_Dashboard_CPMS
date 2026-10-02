/**
 * Everything that turns one member record into an indexable profile page:
 * its URL, its search-result title and snippet, its image, and its Person
 * structured data. The members list, the profile page, the sitemap and any
 * page that links to a person all read from here, so a member has exactly one
 * URL and one identity for search engines to learn.
 *
 * Profiles live at /members/<id>, where <id> is the member's stable slug --
 * the same value that has always been the #anchor on /members. The PI is the
 * exception: /about-the-pi is already her full profile, so she is not given a
 * second page competing with it.
 */

import type { Member, MemberGroup, MembersContent } from './content-types';
import { PARENT_ORGANIZATION, organizationRef } from './site-identity';
import { SITE_URL, absoluteAsset } from './site-url';

export const PI_PROFILE_PATH = '/about-the-pi';
/** The PI's Person node, defined once on /about-the-pi. */
export const PI_PERSON_ID = `${SITE_URL}${PI_PROFILE_PATH}#person`;

/** Groups whose members get a page of their own. Faculty is the PI. */
export const PROFILE_GROUPS: MemberGroup[] = ['postdocs', 'students', 'staff', 'alumni'];

const GROUP_LABELS: Record<MemberGroup, string> = {
  faculty: 'Faculty',
  postdocs: 'Postdoctoral Fellow',
  students: 'Research Scholar',
  staff: 'Lab Staff',
  alumni: 'Alumni',
};

export function groupLabel(group: MemberGroup): string {
  return GROUP_LABELS[group];
}

/** The site path of a member's profile. */
export function profilePath(member: Member, group: MemberGroup): string {
  return group === 'faculty' ? PI_PROFILE_PATH : `/members/${member.id}`;
}

/**
 * A `/members#slug` link -- the shape the dashboard stores for "instrument
 * in-charge" -- rewritten to that member's profile page. Anything else comes
 * back unchanged.
 */
export function profileHrefFromAnchor(href: string): string {
  const match = /^\/members#([a-z0-9-]+)$/i.exec(href.trim());
  return match ? `/members/${match[1]}` : href;
}

export interface LocatedMember {
  member: Member;
  group: MemberGroup;
}

/** Every member that has a profile page, in display order. */
export function profileMembers(members: MembersContent): LocatedMember[] {
  return PROFILE_GROUPS.flatMap((group) =>
    (members[group] ?? []).map((member) => ({ member, group }))
  );
}

export function findMember(members: MembersContent, id: string): LocatedMember | null {
  for (const group of Object.keys(members) as MemberGroup[]) {
    const member = (members[group] ?? []).find((m) => m.id === id);
    if (member) return { member, group };
  }
  return null;
}

/** A photo worth indexing: the generic placeholder is not one. */
export function memberImage(member: Member): string | null {
  const image = member.image?.trim();
  if (!image || /empty_dp/i.test(image)) return null;
  return image;
}

/** Descriptive alt text: who it is and where, not "X's photo". */
export function memberImageAlt(member: Member): string {
  return `${member.name.trim()}, ${member.title.trim()} at CBRL, IIT Kharagpur`;
}

/** Comma-separated research areas, trimmed, empties dropped. */
export function researchAreas(member: Member): string[] {
  return (member.research ?? '')
    .split(',')
    .map((area) => area.trim())
    .filter(Boolean);
}

/**
 * The page title, before the site-wide " | CBRL, IIT Kharagpur" suffix. The
 * name leads, because it is what people search for; the role follows, so two
 * people's results are told apart at a glance.
 */
export function profileTitle({ member, group }: LocatedMember): string {
  const role = group === 'alumni' ? `Former ${member.title.trim()}` : member.title.trim();
  return `${member.name.trim()}, ${role}`;
}

/** "a" or "an" for a role title: "an Assistant Professor", "a Research Scholar". */
function article(title: string): string {
  return /^[aeiou]/i.test(title.trim()) ? 'an' : 'a';
}

/** Cut at a word boundary, under `max` characters. */
function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`;
}

/**
 * The meta description: a sentence naming the person, their role, the lab and
 * IIT Kharagpur -- the words a name search is paired with -- then what they
 * work on. Kept under ~155 characters, where Google truncates.
 */
export function profileDescription({ member, group }: LocatedMember): string {
  const name = member.name.trim();
  const lead =
    group === 'alumni'
      ? `${name} is a former ${member.title.trim()} of the Clinical Biomarker Research Laboratory (CBRL), IIT Kharagpur.`
      : `${name} is ${article(member.title)} ${member.title.trim()} at the Clinical Biomarker Research Laboratory (CBRL), IIT Kharagpur.`;
  const areas = researchAreas(member);
  const tail =
    group === 'alumni' && member.currentPosition?.trim()
      ? ` Now ${member.currentPosition.trim()}.`
      : areas.length
        ? ` Research: ${areas.join(', ')}.`
        : member.bio?.trim()
          ? ` ${member.bio.trim()}`
          : '';
  return clip(lead + tail, 158);
}

/** Profile-link URLs that are real, not template placeholders. */
function profileUrls(member: Member): string[] {
  return Object.values(member.profiles ?? {}).filter(
    (url): url is string =>
      Boolean(url) && !url!.includes('YOUR_ID') && !url!.includes('YOUR_PROFILE')
  );
}

/** The @id of a member's Person node. */
export function personId({ member, group }: LocatedMember): string {
  return group === 'faculty' ? PI_PERSON_ID : `${SITE_URL}${profilePath(member, group)}#person`;
}

/**
 * The member as a schema.org Person. The same node, with the same @id, is
 * emitted on /members and on their profile page, so search engines merge the
 * two into one person rather than learning two.
 */
export function personSchema(located: LocatedMember): Record<string, unknown> {
  const { member, group } = located;
  const name = member.name.trim();
  const person: Record<string, unknown> = {
    '@type': 'Person',
    '@id': personId(located),
    name,
    url: `${SITE_URL}${profilePath(member, group)}`,
    jobTitle: member.title.trim(),
  };

  // Current members work for the lab; alumni studied or worked there.
  if (group === 'alumni') {
    person.alumniOf = [organizationRef, PARENT_ORGANIZATION];
  } else {
    person.worksFor = organizationRef;
    person.memberOf = organizationRef;
    person.affiliation = PARENT_ORGANIZATION;
  }

  const image = memberImage(member);
  if (image) {
    person.image = {
      '@type': 'ImageObject',
      url: absoluteAsset(image),
      caption: memberImageAlt(member),
    };
  }

  const email = member.email?.split(',')[0]?.trim();
  if (email) person.email = email;
  if (member.bio?.trim() && member.bio !== 'Loading...') person.description = member.bio.trim();

  const areas = researchAreas(member);
  if (areas.length) person.knowsAbout = areas;

  if (member.qualifications) {
    const credentials = member.qualifications
      .split('\n\n')
      .map((q) => q.split(': ')[0]?.trim())
      .filter(Boolean);
    if (credentials.length) {
      person.hasCredential = credentials.map((credentialCategory) => ({
        '@type': 'EducationalOccupationalCredential',
        credentialCategory,
      }));
    }
  }

  const sameAs = profileUrls(member);
  if (sameAs.length) person.sameAs = sameAs;

  return person;
}

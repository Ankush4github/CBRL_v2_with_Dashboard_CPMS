import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowLeft, Phone, UserRound } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getMembers } from '@/lib/content';
import { jsonLd } from '@/lib/json-ld';
import {
  findMember,
  groupLabel,
  memberImage,
  memberImageAlt,
  personSchema,
  PI_PROFILE_PATH,
  profileDescription,
  profileMembers,
  profilePath,
  profileTitle,
  researchAreas,
} from '@/lib/member-profile';
import { HOME_URL, SITE_NAME, websiteRef } from '@/lib/site-identity';
import { absoluteAsset, SITE_URL } from '@/lib/site-url';
import { EmailLinks, ProfileLinks } from '../member-links';

/**
 * One member's profile: the page a search for their name should land on.
 *
 * Built for every member at deploy time and kept current by the dashboard:
 * a members save revalidates /members/[id] (src/lib/content.ts), and a member
 * added after the last build is rendered on its first visit, since
 * dynamicParams stays on.
 */

type Params = Promise<{ id: string }>;

export async function generateStaticParams() {
  return profileMembers(await getMembers()).map(({ member }) => ({ id: member.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const located = findMember(await getMembers(), id);
  if (!located || located.group === 'faculty') return {};

  const { member, group } = located;
  const path = profilePath(member, group);
  const title = profileTitle(located);
  const description = profileDescription(located);
  const image = memberImage(member);
  const images = image
    ? [{ url: absoluteAsset(image), alt: memberImageAlt(member) }]
    : [{ url: '/images/og/cbrl.jpg', width: 1200, height: 630, alt: SITE_NAME }];

  // `absolute`: members/layout.tsx sets a plain-string title, and Next stops
  // the root "%s | CBRL, IIT Kharagpur" template at a layout that does --
  // without this the suffix, and "IIT Kharagpur" with it, went missing.
  const fullTitle = `${title} | CBRL, IIT Kharagpur`;

  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      type: 'profile',
      url: `${SITE_URL}${path}`,
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      locale: 'en_US',
      images,
    },
    twitter: {
      // A portrait reads better as the small square card than cropped to the
      // wide one.
      card: image ? 'summary' : 'summary_large_image',
      title: fullTitle,
      description,
      images: images.map(({ url, alt }) => ({ url, alt })),
    },
  };
}

function formatMonthYear(value: string) {
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

/** Blank-line separated `Degree: Institution` lines. */
function qualifications(text: string) {
  return text
    .split('\n\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const at = item.indexOf(': ');
      return at === -1
        ? { degree: item, institution: '' }
        : { degree: item.slice(0, at).trim(), institution: item.slice(at + 2).trim() };
    });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:pt-0.5">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}

export default async function MemberProfile({ params }: { params: Params }) {
  const { id } = await params;
  const located = findMember(await getMembers(), id);
  if (!located) notFound();
  // The PI's profile is /about-the-pi; one URL per person.
  if (located.group === 'faculty') permanentRedirect(PI_PROFILE_PATH);

  const { member, group } = located;
  const name = member.name.trim();
  const path = profilePath(member, group);
  const url = `${SITE_URL}${path}`;
  const image = memberImage(member);
  const areas = researchAreas(member);
  const degrees = member.qualifications ? qualifications(member.qualifications) : [];

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      '@id': url,
      url,
      name: `${profileTitle(located)} | CBRL, IIT Kharagpur`,
      description: profileDescription(located),
      isPartOf: websiteRef,
      mainEntity: personSchema(located),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: HOME_URL },
        { '@type': 'ListItem', position: 2, name: 'Team Members', item: `${SITE_URL}/members` },
        { '@type': 'ListItem', position: 3, name, item: url },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {structuredData.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
        />
      ))}

      <PageHeader
        eyebrow={group === 'alumni' ? 'Alumni' : groupLabel(group)}
        title={name}
        lead={`${member.title.trim()}, Clinical Biomarker Research Laboratory (CBRL), IIT Kharagpur`}
      />

      <div className="container mx-auto px-4 py-12 sm:px-6 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-foreground hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={`/members#${member.id}`} className="hover:text-foreground hover:underline">
                Team Members
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">
              {name}
            </li>
          </ol>
        </nav>

        <article className="overflow-hidden rounded-lg border bg-card">
          <div className="grid lg:grid-cols-5">
            <div className="border-b lg:col-span-2 lg:border-b-0 lg:border-r">
              <div className="relative aspect-[4/5] w-full bg-muted lg:h-full lg:min-h-[28rem] lg:aspect-auto">
                {image ? (
                  <Image
                    src={image}
                    alt={memberImageAlt(member)}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover object-center"
                    quality={80}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <UserRound className="h-20 w-20" strokeWidth={1} aria-hidden="true" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6 p-6 sm:p-10 lg:col-span-3">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  {member.title.trim()}
                  {member.joinedDate && group !== 'alumni' && (
                    <span className="font-medium text-muted-foreground">
                      {' '}
                      <span aria-hidden="true">&middot;</span> Since {formatMonthYear(member.joinedDate)}
                    </span>
                  )}
                </p>
                {member.bio?.trim() && (
                  <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {member.bio.trim()}
                  </p>
                )}
              </div>

              {areas.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Research Areas
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {areas.map((area) => (
                      <Badge key={area} variant="outline" className="rounded-full font-normal text-muted-foreground">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <dl className="space-y-4">
                {group === 'alumni' && member.currentPosition?.trim() && (
                  <Field label="Current Position">{member.currentPosition.trim()}</Field>
                )}
                {member.thesisTitle?.trim() && (
                  <Field label="Thesis">
                    <span className="italic">{member.thesisTitle.trim()}</span>
                  </Field>
                )}
                {member.responsibilities?.trim() && (
                  <Field label="Responsibilities">{member.responsibilities.trim()}</Field>
                )}
                {degrees.length > 0 && (
                  <Field label="Education">
                    <ul className="space-y-1.5">
                      {degrees.map(({ degree, institution }) => (
                        <li key={`${degree}-${institution}`}>
                          <span className="font-medium text-foreground">{degree}</span>
                          {institution && <>, {institution}</>}
                        </li>
                      ))}
                    </ul>
                  </Field>
                )}
                {member.email?.trim() && (
                  <Field label="Email">
                    <EmailLinks emails={member.email} />
                  </Field>
                )}
                {member.phone?.trim() && (
                  <Field label="Phone">
                    <a
                      href={`tel:${member.phone.replace(/[^\d+]/g, '')}`}
                      className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {member.phone.trim()}
                    </a>
                  </Field>
                )}
                {member.profiles && Object.values(member.profiles).some(Boolean) && (
                  <Field label="Academic Profiles">
                    <ProfileLinks profiles={member.profiles} />
                  </Field>
                )}
              </dl>
            </div>
          </div>
        </article>

        <p className="mt-10 text-sm text-muted-foreground">
          {name} {group === 'alumni' ? 'was' : 'is'} part of the{' '}
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            Clinical Biomarker Research Laboratory
          </Link>{' '}
          at IIT Kharagpur, led by{' '}
          <Link href={PI_PROFILE_PATH} className="text-primary underline-offset-4 hover:underline">
            Prof. Koel Chaudhury
          </Link>
          . See the lab&rsquo;s{' '}
          <Link href="/research" className="text-primary underline-offset-4 hover:underline">
            research areas
          </Link>{' '}
          and{' '}
          <Link href="/publications" className="text-primary underline-offset-4 hover:underline">
            publications
          </Link>
          .
        </p>

        <Link
          href={`/members#${member.id}`}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All team members
        </Link>
      </div>
    </div>
  );
}

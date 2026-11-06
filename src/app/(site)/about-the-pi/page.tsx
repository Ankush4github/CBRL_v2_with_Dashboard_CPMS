import Image from 'next/image';
import { jsonLd } from '@/lib/json-ld';
import { organizationRef } from '@/lib/site-identity';
import { ArrowUpRight, ExternalLink, MapPin, Phone, Mail } from 'lucide-react';

import { getAbout, getMembers, readPublicationsFile } from '@/lib/content';
import { splitEntries } from '@/lib/bibtex-entries';
import { fillAboutCounts } from '@/lib/content-types';
import { absoluteAsset } from '@/lib/site-url';
import { PI_PERSON_ID } from '@/lib/member-profile';
import { Button } from '@/components/ui/button';
import { PROFILE_META } from '../members/member-links';

/**
 * Everything on this page comes from the `about` collection, edited under
 * /admin/about — except the publication count, which is derived from the
 * BibTeX record so it cannot drift from the publications page. Copy written in
 * the dashboard can ask for that figure with the `{publications}` token.
 *
 * The academic-profile links are the PI's entry in the members collection
 * (Faculty, under /admin/members), the same links the Team page shows, so
 * they are edited in one place.
 */
export default async function About() {
  const [about, bibtex, members] = await Promise.all([getAbout(), readPublicationsFile(), getMembers()]);
  const academicProfiles = Object.entries(members.faculty?.[0]?.profiles ?? {}).filter(
    (entry): entry is [string, string] => Boolean(entry[1])
  );
  const publicationsCount = splitEntries(bibtex).length;

  /** Resolve `{publications}` in a piece of editor-written copy. */
  const fill = (text: string) => fillAboutCounts(text, publicationsCount);

  const { hero, profile, biography, awards, impact, contact } = about;
  const stats = about.stats.map((stat) => ({ ...stat, value: fill(stat.value) }));

  // The number is written for people ("+91-3222-283572") but has to be dialable.
  const telHref = `tel:${profile.phone.replace(/[^\d+]/g, '')}`;

  // JSON-LD Person record. The portrait, contact details and award list are
  // pulled from the same content the page renders, so an edit cannot leave the
  // structured data describing a portrait or a phone number that is no longer
  // on the page; the rest is stable description of the lab.
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    // Referenced from the members list, so the two pages describe one person.
    '@id': PI_PERSON_ID,
    name: 'Prof. Koel Chaudhury',
    givenName: 'Koel',
    familyName: 'Chaudhury',
    honorificPrefix: 'Prof.',
    honorificSuffix: 'Ph.D.',
    jobTitle: 'Professor and Principal Investigator',
    url: 'https://cbrl.iitkgp.ac.in/about-the-pi',
    image: absoluteAsset(profile.image),
    email: profile.email,
    telephone: profile.phone,
    worksFor: organizationRef,
    affiliation: {
      '@type': 'EducationalOrganization',
      name: 'School of Medical Science and Technology',
      parentOrganization: {
        '@type': 'CollegeOrUniversity',
        name: 'Indian Institute of Technology Kharagpur'
      }
    },
    alumniOf: {
      '@type': 'CollegeOrUniversity',
      name: 'IIT Delhi'
    },
    knowsAbout: [
      'Biomarker Research',
      'Metabolomics',
      'Proteomics',
      'Women\'s Health',
      'Respiratory Disorders',
      'Clinical Diagnostics',
      'Precision Medicine'
    ],
    award: awards.items.map((item) => item.title),
    sameAs: [
      'https://scholar.google.co.in/citations?user=qafn3S0AAAAJ&hl=en',
      'https://orcid.org/0000-0002-9390-1179',
      'https://www.linkedin.com/in/koel-chaudhury-5bab4018/?originalSubdomain=in',
      'https://www.researchgate.net/profile/Koel-Chaudhury'
    ]
  };

  return (
    <div className="min-h-screen bg-background">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(personSchema) }}
      />

      {/* Hero: the photograph as a backdrop, the identity on a glass card */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src={hero.image}
            alt={hero.imageAlt}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(211_62%_8%/0.88)] via-[hsl(211_62%_8%/0.65)] to-[hsl(211_62%_8%/0.25)]" />
        </div>

        <div className="container relative z-10 mx-auto px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="eyebrow text-[hsl(199_90%_75%)]">{hero.eyebrow}</p>
            <h1 className="display-1 mt-3 text-balance text-white">{hero.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">{hero.lead}</p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Profile */}
          <section className="panel overflow-hidden" aria-labelledby="pi-name">
            <div className="grid lg:grid-cols-12">
              <div className="relative aspect-[4/5] bg-muted sm:aspect-[16/11] lg:col-span-5 lg:aspect-[4/5]">
                <Image
                  src={profile.image}
                  alt={profile.imageAlt}
                  fill
                  className="object-cover object-[50%_70%]"
                  sizes="(max-width: 1024px) 100vw, 480px"
                  priority
                />
              </div>

              <div className="flex flex-col p-6 sm:p-10 lg:col-span-7">
                <p className="eyebrow">{profile.eyebrow}</p>
                <h2 id="pi-name" className="display-2 mt-3">{profile.name}</h2>
                <div className="mt-3 space-y-1.5 text-muted-foreground">
                  <p className="font-medium text-foreground">{profile.position}</p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {profile.institution}
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild className="rounded-full">
                    <a href={`mailto:${profile.email}`}>
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Email
                    </a>
                  </Button>
                  {profile.phone && (
                    <Button asChild variant="outline" className="rounded-full">
                      <a href={telHref}>
                        <Phone className="h-4 w-4" aria-hidden="true" />
                        Call
                      </a>
                    </Button>
                  )}
                </div>

                {stats.length > 0 && (
                  <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">
                    {stats.map((stat) => (
                      <div key={stat.label} className="bg-card p-4">
                        <dt className="meta">{stat.label}</dt>
                        <dd className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {academicProfiles.length > 0 && (
                  <div className="mt-8">
                    <h3 className="eyebrow-plain">Academic profiles</h3>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {academicProfiles.map(([key, url]) => {
                        const { label, Icon } = PROFILE_META[key] ?? { label: key, Icon: ExternalLink };
                        return (
                          <li key={key}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="pressable group flex min-h-[48px] items-center gap-3 rounded-2xl border bg-background/60 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span className="flex-1">{label}</span>
                              <ArrowUpRight
                                className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                                aria-hidden="true"
                              />
                              <span className="sr-only">(opens in a new tab)</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Biography */}
          <section className="panel p-6 sm:p-10" aria-labelledby="pi-bio">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <p className="eyebrow">{biography.eyebrow}</p>
                <h2 id="pi-bio" className="display-2 mt-3">{biography.heading}</h2>
              </div>
              <div className="space-y-4 text-[15.5px] leading-[1.75] text-foreground/85 lg:col-span-8">
                {biography.paragraphs.map((paragraph, index) => (
                  <p key={index}>{fill(paragraph)}</p>
                ))}
              </div>
            </div>
          </section>

          {/* Awards & research impact */}
          <div className="grid gap-6 md:grid-cols-2">
            {([['awards', awards], ['impact', impact]] as const).map(([key, section]) => (
              <section key={key} className="panel p-6 sm:p-8" aria-labelledby={`pi-${key}`}>
                <p className="eyebrow">{section.eyebrow}</p>
                <h2 id={`pi-${key}`} className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  {section.heading}
                </h2>
                <ul className="mt-5 space-y-4">
                  {section.items.map((item, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--coral))]" aria-hidden="true" />
                      <div>
                        <p className="font-medium leading-snug text-foreground">{fill(item.title)}</p>
                        {item.description && (
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {fill(item.description)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Contact */}
          <section className="panel p-6 sm:p-8" aria-labelledby="pi-contact">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <p className="eyebrow">{contact.eyebrow}</p>
                <h2 id="pi-contact" className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  {contact.heading}
                </h2>
              </div>
              <dl className="grid gap-5 sm:grid-cols-3 lg:col-span-8">
                <div>
                  <dt className="meta">Email</dt>
                  <dd className="mt-1.5">
                    <a href={`mailto:${profile.email}`} className="break-all text-primary underline-offset-4 hover:underline">
                      {profile.email}
                    </a>
                  </dd>
                </div>
                {profile.phone && (
                  <div>
                    <dt className="meta">Phone</dt>
                    <dd className="mt-1.5">
                      <a href={telHref} className="text-foreground underline-offset-4 hover:underline">
                        {profile.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {contact.office && (
                  <div>
                    <dt className="meta">Office</dt>
                    {/* The address is one textarea in the dashboard, so its line
                        breaks are what separates the lines here. */}
                    <dd className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{contact.office}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

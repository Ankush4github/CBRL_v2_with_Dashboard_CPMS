import Image from 'next/image';
import { MapPin, Phone, Mail } from 'lucide-react';

import { getAbout, readPublicationsFile } from '@/lib/content';
import { splitEntries } from '@/lib/bibtex-entries';
import { fillAboutCounts } from '@/lib/content-types';
import { absoluteAsset } from '@/lib/site-url';
import { Button } from '@/components/ui/button';

/**
 * Everything on this page comes from the `about` collection, edited under
 * /admin/about — except the publication count, which is derived from the
 * BibTeX record so it cannot drift from the publications page. Copy written in
 * the dashboard can ask for that figure with the `{publications}` token.
 */
export default async function About() {
  const [about, bibtex] = await Promise.all([getAbout(), readPublicationsFile()]);
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
    worksFor: {
      '@type': 'ResearchOrganization',
      name: 'Clinical Biomarker Research Laboratory',
      url: 'https://cbrl.iitkgp.ac.in',
      parentOrganization: {
        '@type': 'CollegeOrUniversity',
        name: 'Indian Institute of Technology Kharagpur',
        url: 'https://www.iitkgp.ac.in'
      }
    },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      {/* Hero Section with Background Image */}
      <section className="relative flex min-h-[40vh] items-end overflow-hidden sm:min-h-[45vh]">
        <div className="absolute inset-0 z-0">
          <Image
            src={hero.image}
            alt={hero.imageAlt}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/50" />
        </div>

        <div className="container relative z-10 mx-auto px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              {hero.eyebrow}
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {hero.title}
            </h1>
            <p className="mt-4 max-w-2xl leading-relaxed text-white/90">{hero.lead}</p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl">
          {/* Profile: editorial split */}
          <section className="grid gap-10 lg:grid-cols-12">
            {/* Portrait with hairline frame */}
            <div className="lg:col-span-5">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border bg-muted/40 p-2">
                <div className="relative h-full w-full overflow-hidden rounded-md">
                  <Image
                    src={profile.image}
                    alt={profile.imageAlt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 400px"
                    priority
                  />
                </div>
              </div>
            </div>

            {/* Identity + bio */}
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {profile.eyebrow}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {profile.name}
              </h2>
              <div className="mt-4 space-y-1.5 text-muted-foreground">
                <p className="font-medium text-foreground">{profile.position}</p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  {profile.institution}
                </p>
              </div>

              {/* Quick contact */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <a href={`mailto:${profile.email}`}>
                    <Mail className="h-4 w-4" />
                    Email
                  </a>
                </Button>
                {profile.phone && (
                  <Button asChild variant="outline">
                    <a href={telHref}>
                      <Phone className="h-4 w-4" />
                      Call
                    </a>
                  </Button>
                )}
              </div>

              {/* Stats strip: hairline-divided */}
              <div className="mt-8 grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0">
                {stats.map((stat) => (
                  <div key={stat.label} className="px-4 py-4 first:pl-0">
                    <div className="text-2xl font-semibold tabular-nums sm:text-3xl">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Biography */}
          <section className="mt-16 border-t pt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {biography.eyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {biography.heading}
            </h2>
            <div className="mt-6 space-y-5 leading-relaxed text-muted-foreground">
              {biography.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-justify">
                  {fill(paragraph)}
                </p>
              ))}
            </div>
          </section>

          {/* Awards & Research Impact: left-rule timeline lists */}
          <div className="mt-16 grid gap-12 border-t pt-12 md:grid-cols-2">
            {([['awards', awards], ['impact', impact]] as const).map(([key, section]) => (
              <section key={key}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  {section.eyebrow}
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">{section.heading}</h2>
                <ul className="mt-6 space-y-6 border-l-2 border-primary/30 pl-6">
                  {section.items.map((item, index) => (
                    <li key={index} className="relative">
                      <span
                        className="absolute -left-[1.72rem] top-1.5 h-1.5 w-1.5 rounded-full bg-primary/50"
                        aria-hidden="true"
                      />
                      <p className="font-medium text-foreground">{fill(item.title)}</p>
                      {item.description && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {fill(item.description)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Contact: definition-list rows */}
          <section className="mt-16 border-t pt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {contact.eyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {contact.heading}
            </h2>
            <dl className="mt-8 divide-y border-t">
              <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-4">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </dt>
                <dd className="sm:col-span-3">
                  <a
                    href={`mailto:${profile.email}`}
                    className="break-all text-primary underline-offset-4 hover:underline"
                  >
                    {profile.email}
                  </a>
                </dd>
              </div>
              {profile.phone && (
                <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Phone
                  </dt>
                  <dd className="sm:col-span-3">
                    <a
                      href={telHref}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      {profile.phone}
                    </a>
                  </dd>
                </div>
              )}
              {contact.office && (
                <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Office
                  </dt>
                  {/* The address is one textarea in the dashboard, so its line
                      breaks are what separates the lines here. */}
                  <dd className="whitespace-pre-line text-muted-foreground sm:col-span-3">
                    {contact.office}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

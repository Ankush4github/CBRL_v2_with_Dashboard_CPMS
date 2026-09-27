import Image from 'next/image';
import { jsonLd } from '@/lib/json-ld';
import { HOME_URL, SITE_TITLE, websiteRef } from '@/lib/site-identity';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Coins,
  FileText,
  Puzzle,
  ShieldCheck,
} from 'lucide-react';
import HeroCarousel from '@/components/HeroCarousel';
import { Button } from '@/components/ui/button';
import { splitEntries } from '@/lib/bibtex-entries';
import { getHome, readPublicationsFile } from '@/lib/content';
import type { Collaborator } from '@/lib/content-types';

function SectionHeading({
  number,
  eyebrow,
  title,
}: {
  number: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {number}
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {eyebrow}
        </p>
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

const cardClass =
  'group w-40 flex-shrink-0 rounded-lg border bg-card shadow-none transition-colors hover:border-primary/40 hover:shadow-sm sm:w-52 md:w-64';

function CollabCard({ logo }: { logo: Collaborator }) {
  const body = (
    <div className="flex flex-col items-center p-3 sm:p-4 md:p-6">
      <div className="mb-2 flex h-16 w-full items-center justify-center sm:mb-3 sm:h-20 md:h-24">
        {/* width/height are the rendered size, not the source's. A `sizes`
            value with no vw unit gives Next nothing to narrow the candidate
            list with, so it falls back to emitting every device size — a
            130px-wide logo was shipping a srcset up to 3840w with w=3840 as
            the fallback src. Without `sizes`, Next generates just 1x and 2x.
            `intrinsic` still supplies the aspect ratio. */}
        <Image
          src={logo.src}
          alt={logo.alt}
          width={logo.width}
          height={Math.round((logo.width * logo.intrinsic[1]) / logo.intrinsic[0])}
          quality={60}
          style={{ width: logo.width, height: 'auto' }}
          className="object-contain dark:brightness-90"
        />
      </div>
      <span className="line-clamp-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
        {logo.name}
      </span>
    </div>
  );

  return logo.href ? (
    <a href={logo.href} target="_blank" rel="noopener noreferrer" className={cardClass}>
      {body}
    </a>
  ) : (
    <div className={cardClass}>{body}</div>
  );
}

function CollabRow({ logos, direction }: { logos: Collaborator[]; direction: 'left' | 'right' }) {
  if (logos.length === 0) return null;

  // The keyframes translate the track by exactly -50%, which only lines back up
  // when the second half repeats the first — so the number of copies has to be
  // *even*. Two covers the rows as they stand; a row cut down to one or two
  // logos in the dashboard would leave the track narrower than the viewport and
  // show a gap, so widen it in pairs.
  const copies = Math.ceil(10 / logos.length / 2) * 2;
  const track = Array.from({ length: copies }, () => logos).flat();

  return (
    <div className="relative">
      <div className="flex overflow-hidden">
        <div
          className={`flex gap-3 sm:gap-5 md:gap-8 py-2 sm:py-4 ${
            direction === 'left' ? 'animate-scroll-left' : 'animate-scroll-right'
          }`}
        >
          {track.map((logo, index) => (
            <CollabCard key={`${logo.src}-${index}`} logo={logo} />
          ))}
        </div>
      </div>
    </div>
  );
}

const researchAreas = [
  {
    href: '/research#respiratory-health',
    icon: FileText,
    title: 'Respiratory Health and Disease Subtyping',
    description:
      'Metabolic and molecular profiling for precision diagnostics in respiratory diseases.',
  },
  {
    href: '/research#womens-health',
    icon: Puzzle,
    title: "Women's Health and Reproductive Disorders",
    description:
      'Early prediction and understanding of disease pathogenesis in gynecology and obstetrics',
  },
];

// The publication count is read at render time from the same source as
// /publications, and counted the way /about-the-pi counts it. Publication saves
// revalidate '/', so it stays current without a client-side fetch.
const achievementsFor = (publications: number) => [
  {
    icon: BookOpen,
    value: String(publications),
    label: 'Publications',
    description: 'High-impact research papers in leading journals',
  },
  {
    icon: ShieldCheck,
    value: '4',
    label: 'Patents',
    description: 'Related to cost-effective healthcare',
  },
  {
    icon: ClipboardList,
    value: '1',
    label: 'Clinical Trial',
    description: 'Successful validation studies',
  },
  {
    icon: Coins,
    value: '10Cr+',
    label: 'Research Funding',
    description: 'In competitive grants',
  },
];

export default async function Home() {
  const [{ hero, collaborators }, bibtex] = await Promise.all([getHome(), readPublicationsFile()]);
  const achievements = achievementsFor(splitEntries(bibtex).length);
  const collabRowOne = collaborators.filter((logo) => logo.row === 1);
  const collabRowTwo = collaborators.filter((logo) => logo.row === 2);

  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: SITE_TITLE,
    url: HOME_URL,
    description:
      "Clinical Biomarker Research Laboratory (CBRL) at IIT Kharagpur, led by Prof. Koel Chaudhury. Omics-driven biomarker discovery and insights into disease pathogenesis of complex etiology.",
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: 'https://cbrl.iitkgp.ac.in/images/facilities/waters-ms.jpg',
    },
    // By reference: a second inline WebSite here would be a second, id-less
    // WebSite for Google to reconcile with the one in the (site) layout.
    isPartOf: websiteRef,
    about: [
      { '@type': 'Thing', name: 'Biomarker Research' },
      { '@type': 'Thing', name: 'Metabolomics' },
      { '@type': 'Thing', name: 'Proteomics' },
      { '@type': 'Thing', name: "Women's Health" },
      { '@type': 'Thing', name: 'Respiratory Disorders' },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(homeJsonLd) }}
      />

      {/* Hero Section with Carousel Background Images */}
      <section className="relative flex min-h-[70vh] items-center overflow-hidden sm:min-h-[80vh] md:min-h-[85vh]">
        {/* Background carousel */}
        <HeroCarousel slides={hero.slides} />

        {/* Content overlaid on image */}
        <div className="container relative z-20 mx-auto px-4 py-12 sm:px-6 sm:py-16 md:py-24">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 sm:mb-6">
              Indian Institute of Technology Kharagpur
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
              <span className="mb-1 block text-primary sm:mb-2">Clinical Biomarker</span>
              Research Laboratory
            </h1>
            <div className="mt-6 h-px w-16 bg-white/40 sm:mt-8" aria-hidden="true" />
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/90 sm:mt-8 sm:text-lg md:text-xl">
              Omics-driven Biomarker Discovery and Insights into Disease Pathogenesis of Complex Etiology
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:gap-4">
              <Button asChild size="lg" className="px-8">
                <Link href="/projects">Explore Our Research</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent px-8 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="border-t py-14 sm:py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <SectionHeading number="01" eyebrow="About CBRL" title="Our Mission" />
              </div>
            </div>
            <div className="lg:col-span-8">
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                The Clinical Biomarker Research Laboratory (CBRL) at IIT Kharagpur, led by Professor Koel Chaudhury, is dedicated to advancing biomarker discovery and mechanistic elucidating of complex diseases through cutting-edge multi-omics research. With a strong emphasis on women&#39;s health and respiratory disorders, our laboratory contributes towards diagnostic advancements and bridging translational gaps. We have collaborations with several reputed public and private hospitals and eminent National Institutes, further strengthening our interdisciplinary and impactful scientific contributions. Our work is supported by a robust publication record and a commitment to improving healthcare outcomes.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
                <Button asChild size="lg">
                  <Link href="/projects">Our Projects</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/publications">Publications</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Research */}
      <section className="border-t py-14 sm:py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <SectionHeading
              number="02"
              eyebrow="Research Programmes"
              title="Featured Research Areas"
            />
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Discover our cutting-edge research initiatives that are transforming healthcare
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:gap-6 md:grid-cols-2">
            {researchAreas.map((area) => (
              <Link key={area.href} href={area.href} className="group block h-full">
                <article className="flex h-full flex-col rounded-lg border bg-card p-6 shadow-none transition-colors hover:border-primary/40 hover:shadow-sm sm:p-8">
                  <area.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-semibold tracking-tight transition-colors group-hover:text-primary sm:text-xl">
                    {area.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {area.description}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-primary underline-offset-4 group-hover:underline">
                    Learn more
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Key Achievements */}
      <section className="border-t py-14 sm:py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <SectionHeading number="03" eyebrow="By the Numbers" title="Key Achievements" />
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Our dedication to excellence has led to remarkable outcomes in biomarker research
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 border-t sm:mt-12 lg:grid-cols-4">
            {achievements.map((achievement, index) => (
              <div
                key={achievement.label}
                className={`py-6 pr-4 sm:py-8 ${
                  index % 2 === 1 ? 'border-l pl-6 sm:pl-8' : ''
                } ${index >= 2 ? 'border-t lg:border-t-0' : ''} ${
                  index > 0 ? 'lg:border-l lg:pl-8' : 'lg:border-l-0 lg:pl-0'
                }`}
              >
                <achievement.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <div className="mt-4 text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">
                  {achievement.value}
                </div>
                <div className="mt-2 text-[11px] font-medium uppercase tracking-wider text-foreground sm:text-xs">
                  {achievement.label}
                </div>
                <p className="mt-2 hidden text-xs leading-relaxed text-muted-foreground sm:block sm:text-sm">
                  {achievement.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Collaborations */}
      <section className="overflow-hidden border-t py-14 sm:py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mb-8 max-w-3xl sm:mb-10 md:mb-12">
            <SectionHeading number="04" eyebrow="Partnerships" title="Our Collaborators" />
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Partnering with leading institutions to advance biomarker research and clinical diagnostics
            </p>
          </div>

          {/* First Row - Scrolling Left to Right */}
          {collabRowOne.length > 0 && (
            <div className="mb-4 sm:mb-6 md:mb-8">
              <CollabRow logos={collabRowOne} direction="left" />
            </div>
          )}

          {/* Second Row - Scrolling Right to Left */}
          <CollabRow logos={collabRowTwo} direction="right" />
        </div>
      </section>

      {/* Join Us / Contact */}
      <section className="border-y bg-muted/40 py-14 sm:py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Opportunities
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Join Our Research Team
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
              We&#39;re always looking for talented researchers and students who are passionate
              about advancing healthcare through biomarker research.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
              <Button asChild size="lg" className="px-8">
                <Link href="/contact">Contact Us</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-8">
                <Link href="/members">Meet Our Team</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

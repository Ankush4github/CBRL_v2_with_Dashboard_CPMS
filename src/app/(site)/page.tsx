import Image from 'next/image';
import { jsonLd } from '@/lib/json-ld';
import { HOME_URL, SITE_TITLE, websiteRef } from '@/lib/site-identity';
import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  GraduationCap,
  Handshake,
  Mail,
  MapPin,
  Microscope,
  Phone,
  Puzzle,
} from 'lucide-react';
import HeroCarousel from '@/components/HeroCarousel';
import { Button } from '@/components/ui/button';
import MolecularLattice from '@/components/science/MolecularLattice';
import CountUp from '@/components/site/CountUp';
import SectionHeading from '@/components/site/SectionHeading';
import { splitEntries } from '@/lib/bibtex-entries';
import { getHome, readPublicationsFile } from '@/lib/content';
import type { Collaborator } from '@/lib/content-types';
import { cn } from '@/lib/utils';

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

/* The publication count is read at render time from the same source as
   /publications; the other figures are fixed. */
const LAB_HIGHLIGHTS = [
  { value: '4', label: 'Patents', description: 'Related to cost-effective healthcare' },
  { value: '1', label: 'Clinical trial', description: 'Successful validation studies' },
  { value: '10Cr+', label: 'Research funding', description: 'In competitive grants' },
] as const;

/* The sections below are ported from the CBRL_V2 home page. */

function Statistics({ publications }: { publications: number }) {
  const stats = [
    { value: String(publications), label: 'Publications', description: 'High-impact research papers in leading journals' },
    ...LAB_HIGHLIGHTS,
  ];

  return (
    <section className="border-y bg-card" aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="sr-only">The lab in numbers</h2>
      <div className="container mx-auto px-4 sm:px-6">
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                'py-7 sm:py-10',
                i % 2 === 1 && 'border-l pl-6 sm:pl-10',
                i >= 2 && 'border-t lg:border-t-0',
                i > 0 && 'lg:border-l lg:pl-10',
                i === 2 && 'lg:pl-10'
              )}
            >
              <dt className="meta">{s.label}</dt>
              <dd className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">
                <CountUp value={s.value} />
              </dd>
              <dd className="mt-2 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                <span className="mb-2 block h-0.5 w-8 rounded-full bg-[hsl(var(--coral))]" aria-hidden="true" />
                {s.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CollabLogo({ logo }: { logo: Collaborator }) {
  // Fit the logo in a 96×64 box at its own ratio (`intrinsic`), never wider
  // than the editor-set width. Working the size out here, rather than
  // squeezing it with CSS max-height, keeps width and height in proportion.
  const ratio = logo.intrinsic[1] / logo.intrinsic[0];
  let width = Math.min(logo.width, 96);
  let height = width * ratio;
  if (height > 64) {
    height = 64;
    width = height / ratio;
  }

  const body = (
    <>
      <span className="flex h-16 items-center justify-center">
        <Image
          src={logo.src}
          alt={logo.alt}
          width={Math.round(width)}
          height={Math.round(height)}
          quality={60}
          className="object-contain dark:brightness-90"
        />
      </span>
      <span className="mt-3 block text-center text-xs font-medium leading-snug text-muted-foreground">{logo.name}</span>
    </>
  );
  const cls = 'panel flex h-full flex-col items-center justify-center p-5';
  return logo.href ? (
    <a href={logo.href} target="_blank" rel="noopener noreferrer" className={cn(cls, 'panel-hover')}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Collaborators({ collaborators }: { collaborators: Collaborator[] }) {
  if (collaborators.length === 0) return null;
  const ordered = [...collaborators].sort((a, b) => a.row - b.row);
  return (
    <section className="section section-tint border-t" aria-labelledby="collab-heading">
      <div className="container mx-auto px-4 sm:px-6">
        <SectionHeading
          id="collab-heading"
          eyebrow="Collaborations"
          title="Clinical and institutional collaborators"
          intro="We collaborate with public and private hospitals and national institutes for clinical samples, expertise and validation."
          align="center"
        />
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {ordered.map((logo) => (
            <li key={logo.src} data-reveal>
              <CollabLogo logo={logo} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function JoinUs() {
  const paths = [
    {
      icon: GraduationCap,
      title: 'Students and researchers',
      body: 'Passionate about advancing healthcare through biomarker research? Write to us about your interests.',
      href: '/contact?subject=Research%20opportunities%20at%20CBRL',
      cta: 'Get in touch',
    },
    {
      icon: Handshake,
      title: 'Clinical and academic collaborators',
      body: 'We welcome collaborations with researchers, clinicians and industry partners.',
      href: '/contact?subject=Collaboration%20enquiry',
      cta: 'Propose a collaboration',
    },
    {
      icon: Microscope,
      title: 'Facility users',
      body: 'Use our instrumentation on published slot charges for internal, academic and industry users.',
      href: '/facilities#enquiry',
      cta: 'Facility enquiry',
    },
  ];

  return (
    <section className="section" aria-labelledby="join-heading">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-accent via-card to-[hsl(var(--coral-soft))] p-6 sm:p-10 lg:p-14">
          <MolecularLattice className="pointer-events-none absolute -right-16 -top-10 h-80 w-96 text-primary/10" />
          <div className="relative grid gap-7 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-5">
              <p className="eyebrow">Opportunities</p>
              <h2 id="join-heading" className="display-2 mt-4 text-balance">
                Collaborate with us to advance biomedical research
              </h2>
              <p className="lead mt-4">
                Researchers, students, clinicians and facility users — find the right way to work with CBRL.
              </p>
              <Link href="/members" className="link-arrow mt-6">
                Meet the team <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-3 lg:col-span-7">
              {paths.map((p) => (
                <li key={p.title}>
                  <Link href={p.href} className="glass panel-hover group flex h-full flex-col p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <p.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="mt-4 font-semibold leading-snug text-foreground">{p.title}</span>
                    <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</span>
                    <span className="link-arrow mt-auto pt-5">
                      {p.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactStrip() {
  const items = [
    {
      icon: MapPin,
      label: 'Visit',
      value: 'Rooms 329–330, Life Science Building, IIT Kharagpur 721302',
      href: 'https://maps.google.com/?q=Life+Science+Building,+IIT+Kharagpur',
      external: true,
    },
    { icon: Mail, label: 'Email', value: 'contact.cbrl@smst.iitkgp.ac.in', href: 'mailto:contact.cbrl@smst.iitkgp.ac.in' },
    { icon: Phone, label: 'Phone', value: '+91 03222 282221', href: 'tel:+9103222282221' },
  ];
  return (
    <section className="border-t bg-card" aria-labelledby="contact-heading">
      <div className="container mx-auto grid gap-8 px-4 py-8 sm:px-6 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-3">
          <h2 id="contact-heading" className="text-xl font-semibold tracking-tight">Contact the lab</h2>
          <Link href="/contact" className="link-arrow mt-2">
            Send a message <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3 lg:col-span-9">
          {items.map((it) => (
            <li key={it.label}>
              <a
                href={it.href}
                {...(it.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="group flex h-full items-start gap-3 rounded-2xl p-3 transition-colors hover:bg-accent/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <it.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="meta block">{it.label}</span>
                  <span className="mt-1 block break-words text-sm font-medium text-foreground">{it.value}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function Home() {
  const [{ hero, collaborators }, bibtex] = await Promise.all([getHome(), readPublicationsFile()]);
  // Counted the way /about-the-pi counts it, so the two pages always agree.
  const publicationCount = splitEntries(bibtex).length;

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
                <SectionHeading eyebrow="About CBRL" title="Our Mission" />
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
              eyebrow="Research Programmes"
              title="Featured Research Areas"
              intro="Discover our cutting-edge research initiatives that are transforming healthcare"
            />
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

      <Statistics publications={publicationCount} />
      <Collaborators collaborators={collaborators} />
      <JoinUs />
      <ContactStrip />
    </div>
  );
}

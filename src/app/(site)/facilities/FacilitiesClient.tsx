'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Info, Mail, Search, X } from 'lucide-react';
import { jsonLd } from '@/lib/json-ld';
import { HOME_URL, ORGANIZATION_ID, PARENT_ORGANIZATION, SITE_NAME } from '@/lib/site-identity';
import { profileHrefFromAnchor } from '@/lib/member-profile';
import { chargeFor, fundingLabel, instrumentSlug } from '@/lib/research-links';
import { cn } from '@/lib/utils';

import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { FacilitiesContent, FacilityCharge, Instrument } from '@/lib/content-types';

function enquiryHref(instrument: Instrument) {
  return `/contact?subject=${encodeURIComponent(`Facility enquiry: ${instrument.title}`)}`;
}

function ChargeTable({ charge, caption }: { charge: FacilityCharge; caption?: string }) {
  return (
    <table className="w-full text-sm">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr className="border-b text-left">
          <th scope="col" className="meta py-2 pr-4 font-semibold">User category</th>
          <th scope="col" className="meta py-2 text-right font-semibold">Per {charge.duration}</th>
        </tr>
      </thead>
      <tbody>
        {charge.prices.map((p) => (
          <tr key={p.label} className="border-b last:border-0">
            <th scope="row" className="py-2.5 pr-4 text-left font-normal text-muted-foreground">{p.label}</th>
            <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">{p.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InstrumentDialog({
  instrument,
  charge,
  chargesNote,
  onClose,
}: {
  instrument: Instrument | null;
  charge?: FacilityCharge;
  chargesNote: string;
  onClose: () => void;
}) {
  const inCharge = instrument?.inCharge ?? null;

  return (
    <Dialog open={!!instrument} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:rounded-3xl [&>button:last-child]:right-5 [&>button:last-child]:top-5 [&>button:last-child]:rounded-full [&>button:last-child]:p-1.5 [&>button:last-child]:hover:bg-foreground/[0.06]">
        {instrument && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* Header: a spec-sheet heading. The photo is a 4:3 thumbnail —
                a gentle crop that suits both the portrait and the panoramic
                instrument photos — beside the instrument's identity. */}
            <header className="grid gap-5 border-b bg-[hsl(var(--surface-tint))] p-6 pr-14 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center sm:gap-6 sm:p-8 sm:pr-16">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                <Image
                  src={instrument.imageSrc}
                  alt={instrument.imageAlt}
                  fill
                  sizes="(max-width: 640px) 100vw, 208px"
                  className="object-cover"
                />
              </div>
              <DialogHeader className="space-y-0 text-left">
                <p className="meta text-primary">{fundingLabel(instrument.fundingSource)}</p>
                <DialogTitle className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-[1.75rem]">
                  {instrument.title}
                </DialogTitle>
                <DialogDescription className={instrument.subtitle ? 'mt-1.5 text-base text-muted-foreground' : 'sr-only'}>
                  {instrument.subtitle || `Details for ${instrument.title}`}
                </DialogDescription>
                <div className="mt-4 flex flex-wrap gap-2">
                  {charge && (
                    <span className="chip gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                      Slot: {charge.duration}
                    </span>
                  )}
                  {inCharge?.name && <span className="chip">In-charge: {inCharge.name}</span>}
                </div>
              </DialogHeader>
            </header>

            <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-2">
              {/* Capabilities */}
              <section aria-labelledby="inst-capabilities">
                <h3 id="inst-capabilities" className="eyebrow-plain">Capabilities</h3>
                <ul className="mt-3 space-y-2.5">
                  {instrument.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/90">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold tabular-nums text-primary">
                        {i + 1}
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                {instrument.fundingSource && (
                  <div className="mt-6 border-t pt-4">
                    <h3 className="eyebrow-plain">Funding source</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{instrument.fundingSource}</p>
                  </div>
                )}
              </section>

              <div className="space-y-4">
                {/* Charges */}
                <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="inst-charges">
                  <h3 id="inst-charges" className="eyebrow-plain">Slot charges</h3>
                  {charge ? (
                    <>
                      <div className="mt-2">
                        <ChargeTable charge={charge} caption={`Slot charges for ${instrument.title}`} />
                      </div>
                      {chargesNote && <p className="mt-2 text-xs text-muted-foreground">{chargesNote}</p>}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No slot charge is published for this instrument. Please contact the instrument in-charge.
                    </p>
                  )}
                </section>

                {/* Access */}
                <section className="rounded-2xl bg-accent/60 p-4 sm:p-5" aria-labelledby="inst-access">
                  <h3 id="inst-access" className="eyebrow-plain">Access and enquiry</h3>
                  {inCharge && (
                    <p className="mt-2 text-sm">
                      {inCharge.link ? (
                        <Link
                          href={profileHrefFromAnchor(inCharge.link)}
                          className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {inCharge.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-foreground">{inCharge.name}</span>
                      )}
                      {inCharge.title && <span className="text-muted-foreground"> · {inCharge.title}</span>}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild className="glass-prominent rounded-full">
                      <Link href={enquiryHref(instrument)}>
                        Send an enquiry <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                    {inCharge?.email && (
                      <Button asChild variant="outline" className="rounded-full bg-card">
                        <a
                          href={`mailto:${inCharge.email}?subject=${encodeURIComponent(`Instrument enquiry: ${instrument.title}`)}`}
                        >
                          <Mail className="h-4 w-4" aria-hidden="true" />
                          Email in-charge
                        </a>
                      </Button>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function FacilitiesClient({ stats, instruments, charges, chargesNote }: FacilitiesContent) {
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [query, setQuery] = useState('');

  const filters = useMemo(
    () => ['All', ...Array.from(new Set(instruments.map((f) => fundingLabel(f.fundingSource))))],
    [instruments]
  );

  const visible = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return instruments.filter((f) => {
      if (activeFilter !== 'All' && fundingLabel(f.fundingSource) !== activeFilter) return false;
      if (terms.length === 0) return true;
      const text = [f.title, f.subtitle, ...f.features].join(' ').toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [instruments, activeFilter, query]);

  // A hash naming an instrument (#atomic-force-microscope) opens its panel, so
  // the homepage and other pages can link straight to one.
  useEffect(() => {
    const open = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      const match = instruments.find((i) => instrumentSlug(i) === slug);
      if (match) setSelected(match);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [instruments]);

  const close = () => {
    setSelected(null);
    if (instruments.some((i) => `#${instrumentSlug(i)}` === window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  return (
    <div className="bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            // The lab itself, merged with the site-wide Organization by @id.
            '@type': 'ResearchOrganization',
            '@id': ORGANIZATION_ID,
            name: SITE_NAME,
            url: HOME_URL,
            description:
              'State-of-the-art laboratory facilities for biomarker research, metabolomics, and proteomics at IIT Kharagpur',
            parentOrganization: PARENT_ORGANIZATION,
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Life Science Building, Room 329-330',
              addressLocality: 'Kharagpur',
              addressRegion: 'West Bengal',
              postalCode: '721302',
              addressCountry: 'IN',
            },
            knowsAbout: [
              'Mass Spectrometry',
              'HPLC',
              'FTIR Spectroscopy',
              'Atomic Force Microscopy',
              'Zeta Potential Analysis',
              'Biomarker Discovery',
              'Metabolomics',
              'Proteomics',
            ],
            hasOfferCatalog: {
              '@type': 'OfferCatalog',
              name: 'Laboratory Instrument Services',
              itemListElement: instruments.map((f) => ({
                '@type': 'Offer',
                itemOffered: {
                  '@type': 'Service',
                  name: f.title,
                  description: f.features.slice(0, 2).join('. '),
                },
              })),
            },
          }),
        }}
      />

      <PageHeader
        eyebrow="Facilities"
        title="Laboratory facilities"
        lead="Cutting-edge instrumentation powering breakthroughs in clinical proteomics, metabolomics, and biomarker discovery — open to users within and outside IIT Kharagpur."
        actions={
          <>
            <Button asChild size="lg" className="rounded-full">
              <a href="#instruments">Browse instruments</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full bg-card/70">
              <a href="#charges">Slot charges</a>
            </Button>
          </>
        }
        aside={
          stats.length > 0 ? (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-[0_10px_40px_-16px_hsl(var(--shadow-color)/0.25)]">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-card/95 p-5 sm:p-6">
                  <dt className="meta">{stat.label}</dt>
                  <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : undefined
        }
      />

      {/* ------------------------------------------------------- directory */}
      <section id="instruments" className="section scroll-mt-28" aria-labelledby="instruments-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">Instrument directory</p>
              <h2 id="instruments-heading" className="display-2 mt-4">Analytical platforms</h2>
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search instruments or capabilities"
                aria-label="Search instruments"
                className="h-11 rounded-full bg-card pl-10"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by funding source">
            <span className="meta mr-1">Funded by</span>
            {filters.map((filter) => {
              const active = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveFilter(filter)}
                  className={cn(
                    'pressable min-h-[36px] rounded-full border px-3.5 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          <p className="sr-only" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'instrument' : 'instruments'} shown
          </p>

          {visible.length === 0 ? (
            <div className="mt-7 rounded-2xl border border-dashed p-12 text-center">
              <p className="text-muted-foreground">No instruments match your search.</p>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => {
                  setQuery('');
                  setActiveFilter('All');
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" /> Clear filters
              </Button>
            </div>
          ) : (
            <ul className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((facility, i) => {
                const charge = chargeFor(facility, charges);
                return (
                  <li key={facility.title} id={instrumentSlug(facility)} className="scroll-mt-28">
                    <article className="panel panel-hover group flex h-full flex-col overflow-hidden">
                      <div className="relative aspect-[3/2] overflow-hidden bg-muted">
                        <Image
                          src={facility.imageSrc}
                          alt={facility.imageAlt}
                          fill
                          priority={i === 0}
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <h3 className="heading-3">{facility.title}</h3>
                        {facility.subtitle && <p className="mt-1 text-sm text-muted-foreground">{facility.subtitle}</p>}
                        <ul className="mt-4 space-y-2 border-t pt-4 text-sm text-foreground/85">
                          {facility.features.slice(0, 3).map((f, j) => (
                            <li key={j} className="flex gap-2.5">
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--coral))]" aria-hidden="true" />
                              {f}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
                          <span className="text-xs text-muted-foreground">
                            {charge ? (
                              <>
                                Slot charges published
                                <span className="block font-medium text-foreground">per {charge.duration}</span>
                              </>
                            ) : (
                              'Contact in-charge for access'
                            )}
                          </span>
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => setSelected(facility)}
                            aria-haspopup="dialog"
                          >
                            View details
                            <span className="sr-only"> for {facility.title}</span>
                            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- charges */}
      <section id="charges" className="section section-tint scroll-mt-28 border-t" aria-labelledby="charges-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid gap-7 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <p className="eyebrow">Fee schedule</p>
                <h2 id="charges-heading" className="display-2 mt-4">Slot charges</h2>
                <p className="lead mt-4">Charges per slot, by user category.</p>
                {chargesNote && (
                  <p className="mt-4 flex gap-2 text-sm text-muted-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {chargesNote}
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-8">
              {/* Wide screens: one comparison table */}
              <div className="panel hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">Slot charges by instrument and user category</caption>
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th scope="col" className="meta px-5 py-3.5 font-semibold">Instrument</th>
                      <th scope="col" className="meta px-3 py-3.5 font-semibold">Slot</th>
                      {(charges[0]?.prices ?? []).map((p) => (
                        <th key={p.label} scope="col" className="meta px-3 py-3.5 text-right font-semibold last:pr-5">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((c) => (
                      <tr key={c.title} className="border-b last:border-0 hover:bg-accent/30">
                        <th scope="row" className="px-5 py-4 text-left font-semibold text-foreground">{c.title}</th>
                        <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">{c.duration}</td>
                        {c.prices.map((p) => (
                          <td key={p.label} className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums last:pr-5">
                            {p.value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Narrow screens: one card per instrument */}
              <ul className="grid gap-4 md:hidden">
                {charges.map((c) => (
                  <li key={c.title} className="panel p-5">
                    <h3 className="font-semibold">{c.title}</h3>
                    <div className="mt-2">
                      <ChargeTable charge={c} caption={`Slot charges for ${c.title}`} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- enquiry */}
      <section id="enquiry" className="section scroll-mt-28 border-t" aria-labelledby="enquiry-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] bg-[hsl(211_62%_9%)] p-8 text-white sm:p-12">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(40rem_20rem_at_100%_0%,hsl(201_100%_36%/0.4),transparent_60%)]"
            />
            <div className="relative grid gap-7 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <p className="eyebrow text-[hsl(199_90%_70%)]">Facility access</p>
                <h2 id="enquiry-heading" className="display-2 mt-4 text-white">Facility enquiry</h2>
                <p className="mt-4 max-w-xl leading-relaxed text-white/75">
                  To use an instrument, contact the instrument in-charge listed in its details, or send us a
                  facility enquiry naming the instrument, your institution and the analysis you need.
                </p>
                <p className="mt-4 inline-flex items-start gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm text-white/80">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Online slot booking is not available on this website yet. Enquiries are answered by email.
                </p>
              </div>
              <div className="flex flex-col gap-3 lg:col-span-5 lg:items-end">
                <Button asChild size="lg" className="h-12 rounded-full bg-white px-7 text-[hsl(211_62%_9%)] hover:bg-white/90">
                  <Link href="/contact?subject=Facility%20enquiry">
                    Send a facility enquiry <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <a
                  href="mailto:contact.cbrl@smst.iitkgp.ac.in?subject=Facility%20enquiry"
                  className="text-sm text-white/75 underline-offset-4 hover:text-white hover:underline"
                >
                  or email contact.cbrl@smst.iitkgp.ac.in
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <InstrumentDialog
        instrument={selected}
        charge={selected ? chargeFor(selected, charges) : undefined}
        chargesNote={chargesNote}
        onClose={close}
      />
    </div>
  );
}

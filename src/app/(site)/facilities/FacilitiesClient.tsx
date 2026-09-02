'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Mail, ArrowUpRight } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import type { ChargeTier, FacilitiesContent, Instrument } from '@/lib/content-types';

type Facility = Instrument;
type PriceTier = ChargeTier;

// Derive a short, badge-friendly funder label from the full funding string.
function fundingLabel(fundingSource: string): string {
  const first = fundingSource.split('|')[0].trim();
  const paren = first.match(/\(([^)]+)\)/);
  return paren ? paren[1] : first;
}

function InstrumentDialog({
  instrument,
  onClose,
}: {
  instrument: Facility | null;
  onClose: () => void;
}) {
  const inCharge = instrument?.inCharge ?? null;

  return (
    <Dialog open={!!instrument} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {instrument && inCharge && (
          <>
            {/* Instrument image — pinned so the details below keep room to scroll */}
            <div className="relative h-44 w-full shrink-0 overflow-hidden border-b bg-muted/40 sm:h-60">
              <Image
                src={instrument.imageSrc}
                alt={instrument.imageAlt}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
              <DialogHeader className="text-left">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {fundingLabel(instrument.fundingSource)}
                  {instrument.subtitle && (
                    <>
                      <span className="mx-1.5">·</span>
                      {instrument.subtitle}
                    </>
                  )}
                </p>
                <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight">
                  {instrument.title}
                </DialogTitle>
                {instrument.subtitle && (
                  <DialogDescription className="sr-only">
                    {instrument.subtitle}
                  </DialogDescription>
                )}
              </DialogHeader>

              {/* Features */}
              <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Key Features
              </h3>
              <ul className="mt-4 divide-y divide-border border-y">
                {instrument.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-4 py-3.5">
                    <span className="pt-px text-xs font-semibold tabular-nums text-primary">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm leading-relaxed text-foreground">
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Funding source */}
              {instrument.fundingSource && (
                <div className="mt-8">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    Funding Source
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {instrument.fundingSource}
                  </p>
                </div>
              )}

              {/* Instrument in-charge */}
              <div className="mt-8 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Instrument In-Charge
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {inCharge.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{inCharge.title}</p>
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <a href={`mailto:${inCharge.email}`}>
                    <Mail className="h-4 w-4" />
                    Contact In-Charge
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChargeRow({
  title,
  duration,
  prices,
}: {
  title: string;
  duration: string;
  prices: PriceTier[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Per {duration}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {prices.map((p, i) => (
          <div key={i}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {p.label}
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {p.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function FacilitiesClient({
  stats,
  instruments,
  charges,
  chargesNote,
}: FacilitiesContent) {
  const [selectedInstrument, setSelectedInstrument] = useState<Facility | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');

  const facilities = instruments;

  // Build filter options from unique funder labels.
  const funders = Array.from(new Set(facilities.map((f) => fundingLabel(f.fundingSource))));
  const filters = ['All', ...funders];

  const visibleFacilities =
    activeFilter === 'All'
      ? facilities
      : facilities.filter((f) => fundingLabel(f.fundingSource) === activeFilter);

  return (
    <main className="min-h-screen bg-background">
      {/* JSON-LD Structured Data for Research Facility */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ResearchOrganization',
            name: 'Clinical Biomarker Research Laboratory - Facilities',
            url: 'https://cbrl.iitkgp.ac.in/facilities',
            description: 'State-of-the-art laboratory facilities for biomarker research, metabolomics, and proteomics at IIT Kharagpur',
            parentOrganization: {
              '@type': 'CollegeOrUniversity',
              name: 'Indian Institute of Technology Kharagpur',
              url: 'https://www.iitkgp.ac.in'
            },
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Life Science Building, Room 329-330',
              addressLocality: 'Kharagpur',
              addressRegion: 'West Bengal',
              postalCode: '721302',
              addressCountry: 'IN'
            },
            knowsAbout: [
              'Mass Spectrometry',
              'HPLC',
              'FTIR Spectroscopy',
              'Atomic Force Microscopy',
              'Zeta Potential Analysis',
              'Biomarker Discovery',
              'Metabolomics',
              'Proteomics'
            ],
            hasOfferCatalog: {
              '@type': 'OfferCatalog',
              name: 'Laboratory Instrument Services',
              itemListElement: facilities.map(f => ({
                '@type': 'Offer',
                itemOffered: {
                  '@type': 'Service',
                  name: f.title,
                  description: f.features.slice(0, 2).join('. ')
                }
              }))
            }
          })
        }}
      />

      {/* Editorial header */}
      <PageHeader
        eyebrow="Instrumentation Catalogue"
        title="Laboratory Facilities"
        lead="Cutting-edge instrumentation powering breakthroughs in clinical proteomics, metabolomics, and biomarker discovery."
      />

      <div className="container mx-auto px-4 sm:px-6">
        {/* Stats strip — hairline-divided */}
        <section className="grid grid-cols-2 divide-x divide-y divide-border border-b sm:grid-cols-4 sm:divide-y-0">
          {stats.map((stat) => (
            <div key={stat.label} className="px-4 py-8 first:border-l-0">
              <div className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </section>

        {/* Instruments catalogue */}
        <section className="py-14 sm:py-16">
          <div className="flex flex-col gap-6 border-b pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Analytical Platforms
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Our Instruments
              </h2>
            </div>

            {/* Funder filter — understated text chips */}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {filters.map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActiveFilter(filter)}
                    className={
                      'text-[11px] font-medium uppercase tracking-wider underline-offset-4 transition-colors ' +
                      (isActive
                        ? 'text-primary underline'
                        : 'text-muted-foreground hover:text-foreground hover:underline')
                    }
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleFacilities.map((facility) => (
              <button
                key={facility.title}
                type="button"
                onClick={() => setSelectedInstrument(facility)}
                className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left shadow-none transition-colors hover:border-primary/40 hover:shadow-sm"
              >
                <div className="relative aspect-[3/2] overflow-hidden border-b bg-muted/40">
                  <Image
                    src={facility.imageSrc}
                    alt={facility.imageAlt}
                    fill
                    priority={facility.title === 'Mass Spectrometry with DESI MSI'}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {fundingLabel(facility.fundingSource)}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                    {facility.title}
                  </h3>
                  {facility.subtitle && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {facility.subtitle}
                    </p>
                  )}
                  <ul className="mt-4 space-y-2.5 border-t pt-4 text-sm">
                    {facility.features.slice(0, 3).map((f, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="pt-px text-xs font-semibold tabular-nums text-primary">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="leading-relaxed text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 group-hover:underline">
                    View details
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Slot Charges — academic fee table */}
        <section className="pb-16 sm:pb-20">
          <div className="border-b pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Fee Schedule
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Slot Charges
            </h2>
            {chargesNote && (
              <p className="mt-2 text-sm text-muted-foreground">{chargesNote}</p>
            )}
          </div>

          <div className="divide-y divide-border">
            {charges.map((charge) => (
              <ChargeRow
                key={charge.title}
                title={charge.title}
                duration={charge.duration}
                prices={charge.prices}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Instrument Detail Dialog */}
      <InstrumentDialog
        instrument={selectedInstrument}
        onClose={() => setSelectedInstrument(null)}
      />
    </main>
  );
}

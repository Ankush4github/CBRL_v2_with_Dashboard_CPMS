'use client';

import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type {
  FacilitiesContent,
  FacilityCharge,
  FacilityStat,
  Instrument,
} from '@/lib/content-types';
import { AdminPageHeader, EmptyState, ItemCard, SaveBar } from '@/components/admin/EditorChrome';
import {
  FieldSection,
  SelectField,
  StringListField,
  TextField,
} from '@/components/admin/fields';
import { ImageField } from '@/components/admin/ImageField';
import { moveBy, removeAt, replaceAt, useContentEditor } from '@/components/admin/useContentEditor';

export interface Person {
  id: string;
  name: string;
  title: string;
  email: string;
}

function emptyInstrument(): Instrument {
  return {
    title: '',
    subtitle: '',
    imageSrc: '',
    imageAlt: '',
    features: [],
    fundingSource: 'IIT Kharagpur',
    inCharge: { name: '', title: '', email: '', link: '' },
  };
}

function InstrumentForm({
  instrument,
  people,
  onChange,
}: {
  instrument: Instrument;
  people: Person[];
  onChange: (instrument: Instrument) => void;
}) {
  const set = <K extends keyof Instrument>(key: K, value: Instrument[K]) =>
    onChange({ ...instrument, [key]: value });

  const selected = people.find((p) => p.id && instrument.inCharge.link === `/members#${p.id}`);

  return (
    <>
      <FieldSection title="Instrument">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Name"
            value={instrument.title}
            onChange={(value) => set('title', value)}
            placeholder="Atomic Force Microscope"
          />
          <TextField
            label="Model"
            value={instrument.subtitle ?? ''}
            onChange={(value) => set('subtitle', value)}
            placeholder="Bruker Multimode 8-HR"
          />
        </div>

        <TextField
          label="Funding source"
          value={instrument.fundingSource}
          onChange={(value) => set('fundingSource', value)}
          placeholder="Science and Engineering Research Board (SERB) | Sanction Letter No: … | Date: …"
          hint="The text in brackets becomes the filter chip; anything after a | shows only in the dialog."
        />

        <ImageField
          label="Photo"
          value={instrument.imageSrc}
          onChange={(value) => set('imageSrc', value)}
          destination="facilities"
          aspect="aspect-[3/2]"
        />

        <TextField
          label="Photo description"
          value={instrument.imageAlt}
          onChange={(value) => set('imageAlt', value)}
          hint="Alt text read out by screen readers."
        />

        <StringListField
          label="Key features"
          values={instrument.features}
          onChange={(values) => set('features', values)}
          addLabel="Add feature"
          hint="The first three appear on the card; all of them show in the dialog."
        />
      </FieldSection>

      <FieldSection title="Instrument in-charge">
        <SelectField
          label="Lab member"
          value={selected?.id ?? ''}
          options={[
            { value: '', label: 'Custom / not listed' },
            ...people.map((p) => ({ value: p.id, label: `${p.name} — ${p.title}` })),
          ]}
          onChange={(id) => {
            const person = people.find((p) => p.id === id);
            set(
              'inCharge',
              person
                ? {
                    name: person.name,
                    title: person.title,
                    email: person.email.split(',')[0].trim(),
                    link: `/members#${person.id}`,
                  }
                : { ...instrument.inCharge, link: '' }
            );
          }}
          hint="Picking a member fills the fields below and links to their card."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Name"
            value={instrument.inCharge.name}
            onChange={(value) => set('inCharge', { ...instrument.inCharge, name: value })}
          />
          <TextField
            label="Role"
            value={instrument.inCharge.title}
            onChange={(value) => set('inCharge', { ...instrument.inCharge, title: value })}
          />
          <TextField
            label="Contact email"
            value={instrument.inCharge.email}
            onChange={(value) => set('inCharge', { ...instrument.inCharge, email: value })}
          />
          <TextField
            label="Profile link"
            value={instrument.inCharge.link}
            onChange={(value) => set('inCharge', { ...instrument.inCharge, link: value })}
            placeholder="/members#name"
          />
        </div>
      </FieldSection>
    </>
  );
}

function ChargeForm({
  charge,
  onChange,
}: {
  charge: FacilityCharge;
  onChange: (charge: FacilityCharge) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Instrument"
          value={charge.title}
          onChange={(value) => onChange({ ...charge, title: value })}
        />
        <TextField
          label="Slot length"
          value={charge.duration}
          onChange={(value) => onChange({ ...charge, duration: value })}
          placeholder="1 hour"
          hint="Rendered as “Per 1 hour”."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Rates
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...charge, prices: [...charge.prices, { label: '', value: '' }] })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add rate
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {charge.prices.map((price, index) => (
            <div key={index} className="flex items-end gap-2 rounded-md border p-3">
              <TextField
                label="Who"
                value={price.label}
                onChange={(value) =>
                  onChange({ ...charge, prices: replaceAt(charge.prices, index, { ...price, label: value }) })
                }
                className="flex-1"
              />
              <TextField
                label="Rate"
                value={price.value}
                onChange={(value) =>
                  onChange({ ...charge, prices: replaceAt(charge.prices, index, { ...price, value }) })
                }
                className="w-28"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange({ ...charge, prices: removeAt(charge.prices, index) })}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function FacilitiesEditor({
  initial,
  people,
}: {
  initial: FacilitiesContent;
  people: Person[];
}) {
  const editor = useContentEditor<FacilitiesContent>(initial, '/api/admin/content/facilities');
  const { draft, setDraft } = editor;

  const setInstruments = (instruments: Instrument[]) => setDraft({ ...draft, instruments });
  const setCharges = (charges: FacilityCharge[]) => setDraft({ ...draft, charges });
  const setStats = (stats: FacilityStat[]) => setDraft({ ...draft, stats });

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="Instrumentation catalogue"
        title="Facilities"
        lead="Instruments and their in-charges, the headline figures, and the slot charge table."
        page="/facilities"
        actions={
          <Button size="sm" onClick={() => setInstruments([emptyInstrument(), ...draft.instruments])}>
            <Plus className="h-3.5 w-3.5" />
            Add instrument
          </Button>
        }
      />

      <section className="border-b py-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Headline figures
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStats([...draft.stats, { value: '', label: '' }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add figure
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {draft.stats.map((stat, index) => (
            <div key={index} className="space-y-3 rounded-lg border bg-card p-4">
              <TextField
                label="Value"
                value={stat.value}
                onChange={(value) => setStats(replaceAt(draft.stats, index, { ...stat, value }))}
                placeholder="10+"
              />
              <TextField
                label="Label"
                value={stat.label}
                onChange={(value) => setStats(replaceAt(draft.stats, index, { ...stat, label: value }))}
                placeholder="Instruments"
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setStats(removeAt(draft.stats, index))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="py-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Instruments
        </p>
        <div className="mt-4 space-y-3">
          {draft.instruments.length === 0 ? (
            <EmptyState>No instruments listed.</EmptyState>
          ) : (
            draft.instruments.map((instrument, index) => (
              <ItemCard
                key={index}
                index={index}
                total={draft.instruments.length}
                title={instrument.title}
                subtitle={[instrument.subtitle, instrument.inCharge.name]
                  .filter(Boolean)
                  .join(' · ')}
                defaultOpen={!instrument.title}
                onMove={(delta) => setInstruments(moveBy(draft.instruments, index, delta))}
                onRemove={() => setInstruments(removeAt(draft.instruments, index))}
              >
                <InstrumentForm
                  instrument={instrument}
                  people={people}
                  onChange={(next) => setInstruments(replaceAt(draft.instruments, index, next))}
                />
              </ItemCard>
            ))
          )}
        </div>
      </section>

      <section className="border-t py-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Slot charges
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCharges([
                ...draft.charges,
                {
                  title: '',
                  duration: '1 hour',
                  prices: [
                    { label: 'Own Dept', value: '' },
                    { label: 'Other Depts', value: '' },
                    { label: 'Academia (Outside IIT KGP)', value: '' },
                    { label: 'Industry', value: '' },
                  ],
                },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
        </div>

        <div className="mt-4">
          <TextField
            label="Note under the heading"
            value={draft.chargesNote}
            onChange={(value) => setDraft({ ...draft, chargesNote: value })}
            placeholder="GST is included, where applicable."
          />
        </div>

        <div className="mt-4 space-y-3">
          {draft.charges.map((charge, index) => (
            <ItemCard
              key={index}
              index={index}
              total={draft.charges.length}
              title={charge.title}
              subtitle={charge.prices.map((p) => `${p.label} ${p.value}`).join(' · ')}
              defaultOpen={!charge.title}
              onMove={(delta) => setCharges(moveBy(draft.charges, index, delta))}
              onRemove={() => setCharges(removeAt(draft.charges, index))}
            >
              <ChargeForm
                charge={charge}
                onChange={(next) => setCharges(replaceAt(draft.charges, index, next))}
              />
            </ItemCard>
          ))}
        </div>
      </section>

      <SaveBar
        dirty={editor.dirty}
        state={editor.state}
        error={editor.error}
        issues={editor.issues}
        savedAt={editor.savedAt}
        onSave={editor.save}
        onRevert={editor.revert}
      />
    </div>
  );
}

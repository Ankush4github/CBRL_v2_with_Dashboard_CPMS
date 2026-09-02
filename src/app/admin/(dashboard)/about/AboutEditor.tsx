'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  PUBLICATIONS_TOKEN,
  fillAboutCounts,
  type AboutContent,
  type AboutEntry,
  type AboutStat,
} from '@/lib/content-types';
import { AdminPageHeader, SaveBar } from '@/components/admin/EditorChrome';
import {
  FieldSection,
  StringListField,
  TextAreaField,
  TextField,
} from '@/components/admin/fields';
import { ImageField } from '@/components/admin/ImageField';
import { moveBy, removeAt, replaceAt, useContentEditor } from '@/components/admin/useContentEditor';

/** Preview of a value containing the publication-count token, or nothing. */
function tokenHint(value: string, publications: number): string | undefined {
  if (!value.includes(PUBLICATIONS_TOKEN)) return undefined;
  return `Shows as “${fillAboutCounts(value, publications)}”.`;
}

/** Move up / move down / remove, shared by the two list editors below. */
function RowActions({
  index,
  total,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        Move up
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        Move down
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove
      </Button>
    </div>
  );
}

/**
 * Awards and Research impact are the same title/description shape and sit side
 * by side on the public page, so they share one form.
 */
function EntryList({
  label,
  addLabel,
  items,
  publications,
  onChange,
}: {
  label: string;
  addLabel: string;
  items: AboutEntry[];
  publications: number;
  onChange: (items: AboutEntry[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, { title: '', description: '' }])}
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>

      {items.length === 0 && (
        <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          Nothing here yet.
        </p>
      )}

      {items.map((item, index) => (
        <div key={index} className="space-y-3 rounded-lg border bg-card p-4">
          <TextField
            label="Title"
            value={item.title}
            onChange={(title) => onChange(replaceAt(items, index, { ...item, title }))}
            hint={tokenHint(item.title, publications)}
          />
          <TextAreaField
            label="Description"
            rows={2}
            value={item.description}
            onChange={(description) => onChange(replaceAt(items, index, { ...item, description }))}
            hint="Optional — leave blank for a title on its own."
          />
          <RowActions
            index={index}
            total={items.length}
            onMove={(delta) => onChange(moveBy(items, index, delta))}
            onRemove={() => onChange(removeAt(items, index))}
          />
        </div>
      ))}
    </div>
  );
}

export default function AboutEditor({
  initial,
  publications,
}: {
  initial: AboutContent;
  publications: number;
}) {
  const editor = useContentEditor<AboutContent>(initial, '/api/admin/content/about');
  const { draft, setDraft } = editor;

  /** Replace one band of the page, leaving the rest of the document alone. */
  const set = <K extends keyof AboutContent>(key: K, value: AboutContent[K]) =>
    setDraft({ ...draft, [key]: value });

  const setStats = (stats: AboutStat[]) => set('stats', stats);

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="Faculty profile"
        title="About the PI"
        lead="The banner, portrait, biography, awards and contact details on the About the PI page."
        page="/about-the-pi"
      />

      <div className="max-w-3xl space-y-8 py-8">
        <FieldSection title="Banner" description="The full-width band at the top of the page.">
          <ImageField
            label="Background image"
            value={draft.hero.image}
            onChange={(image) => set('hero', { ...draft.hero, image })}
            destination="pi"
            nameHint="about-hero"
            aspect="aspect-[3/2]"
            hint="Shown full width behind a dark gradient, so a wide photograph works best."
          />
          <TextField
            label="Image description"
            value={draft.hero.imageAlt}
            onChange={(imageAlt) => set('hero', { ...draft.hero, imageAlt })}
            hint="Alt text read out by screen readers."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Eyebrow"
              value={draft.hero.eyebrow}
              onChange={(eyebrow) => set('hero', { ...draft.hero, eyebrow })}
              placeholder="Faculty Profile"
              hint="Small line above the heading."
            />
            <TextField
              label="Heading"
              value={draft.hero.title}
              onChange={(title) => set('hero', { ...draft.hero, title })}
              placeholder="About the Principal Investigator"
            />
          </div>

          <TextAreaField
            label="Standfirst"
            rows={2}
            value={draft.hero.lead}
            onChange={(lead) => set('hero', { ...draft.hero, lead })}
          />
        </FieldSection>

        <FieldSection
          title="Profile"
          description="Portrait, name, and the details behind the Email and Call buttons."
        >
          <ImageField
            label="Portrait"
            value={draft.profile.image}
            onChange={(image) => set('profile', { ...draft.profile, image })}
            destination="pi"
            nameHint={draft.profile.name || 'principal-investigator'}
            hint="Cropped to a 4:5 portrait, so keep the face towards the top."
          />
          <TextField
            label="Portrait description"
            value={draft.profile.imageAlt}
            onChange={(imageAlt) => set('profile', { ...draft.profile, imageAlt })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Eyebrow"
              value={draft.profile.eyebrow}
              onChange={(eyebrow) => set('profile', { ...draft.profile, eyebrow })}
              placeholder="Principal Investigator"
            />
            <TextField
              label="Name"
              value={draft.profile.name}
              onChange={(name) => set('profile', { ...draft.profile, name })}
              placeholder="Dr. Koel Chaudhury, Ph.D."
            />
            <TextField
              label="Position"
              value={draft.profile.position}
              onChange={(position) => set('profile', { ...draft.profile, position })}
              placeholder="Professor, School of Medical Science and Technology"
            />
            <TextField
              label="Institution"
              value={draft.profile.institution}
              onChange={(institution) => set('profile', { ...draft.profile, institution })}
              placeholder="Indian Institute of Technology Kharagpur"
            />
            <TextField
              label="Email"
              value={draft.profile.email}
              onChange={(email) => set('profile', { ...draft.profile, email })}
              hint="Used by the Email button and the contact table."
            />
            <TextField
              label="Phone"
              value={draft.profile.phone}
              onChange={(phone) => set('profile', { ...draft.profile, phone })}
              placeholder="+91-3222-283572"
              hint="Shown as written; the Call button dials the digits."
            />
          </div>
        </FieldSection>

        <FieldSection
          title="Headline figures"
          description={`The strip beside the portrait. Type ${PUBLICATIONS_TOKEN} for the live publication count — ${publications} today — so it never goes stale.`}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {draft.stats.map((stat, index) => (
              <div key={index} className="space-y-3 rounded-lg border bg-card p-4">
                <TextField
                  label="Value"
                  value={stat.value}
                  onChange={(value) => setStats(replaceAt(draft.stats, index, { ...stat, value }))}
                  placeholder="23"
                  hint={tokenHint(stat.value, publications)}
                />
                <TextField
                  label="Label"
                  value={stat.label}
                  onChange={(label) => setStats(replaceAt(draft.stats, index, { ...stat, label }))}
                  placeholder="Ph.D. Guided"
                />
                <RowActions
                  index={index}
                  total={draft.stats.length}
                  onMove={(delta) => setStats(moveBy(draft.stats, index, delta))}
                  onRemove={() => setStats(removeAt(draft.stats, index))}
                />
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStats([...draft.stats, { value: '', label: '' }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add figure
          </Button>
        </FieldSection>

        <FieldSection title="Biography">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Eyebrow"
              value={draft.biography.eyebrow}
              onChange={(eyebrow) => set('biography', { ...draft.biography, eyebrow })}
              placeholder="Profile"
            />
            <TextField
              label="Heading"
              value={draft.biography.heading}
              onChange={(heading) => set('biography', { ...draft.biography, heading })}
              placeholder="Biography"
            />
          </div>

          <StringListField
            label="Paragraphs"
            values={draft.biography.paragraphs}
            onChange={(paragraphs) => set('biography', { ...draft.biography, paragraphs })}
            addLabel="Add paragraph"
            multiline
            hint="One box per paragraph. Plain text — a line break inside a box is not kept."
          />
        </FieldSection>

        <FieldSection title="Awards & recognition">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Eyebrow"
              value={draft.awards.eyebrow}
              onChange={(eyebrow) => set('awards', { ...draft.awards, eyebrow })}
              placeholder="Recognition"
            />
            <TextField
              label="Heading"
              value={draft.awards.heading}
              onChange={(heading) => set('awards', { ...draft.awards, heading })}
              placeholder="Awards & Recognition"
            />
          </div>

          <EntryList
            label="Awards"
            addLabel="Add award"
            items={draft.awards.items}
            publications={publications}
            onChange={(items) => set('awards', { ...draft.awards, items })}
          />
        </FieldSection>

        <FieldSection title="Research impact">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Eyebrow"
              value={draft.impact.eyebrow}
              onChange={(eyebrow) => set('impact', { ...draft.impact, eyebrow })}
              placeholder="Impact"
            />
            <TextField
              label="Heading"
              value={draft.impact.heading}
              onChange={(heading) => set('impact', { ...draft.impact, heading })}
              placeholder="Research Impact"
            />
          </div>

          <EntryList
            label="Impact"
            addLabel="Add entry"
            items={draft.impact.items}
            publications={publications}
            onChange={(items) => set('impact', { ...draft.impact, items })}
          />
        </FieldSection>

        <FieldSection title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Eyebrow"
              value={draft.contact.eyebrow}
              onChange={(eyebrow) => set('contact', { ...draft.contact, eyebrow })}
              placeholder="Get in touch"
            />
            <TextField
              label="Heading"
              value={draft.contact.heading}
              onChange={(heading) => set('contact', { ...draft.contact, heading })}
              placeholder="Contact Information"
            />
          </div>

          <TextAreaField
            label="Office"
            rows={3}
            value={draft.contact.office}
            onChange={(office) => set('contact', { ...draft.contact, office })}
            placeholder={'Room No. 328, 3rd Floor\nLife Science Building, SMST\nIIT Kharagpur'}
            hint="One line per line break. The email and phone rows come from Profile above."
          />
        </FieldSection>
      </div>

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

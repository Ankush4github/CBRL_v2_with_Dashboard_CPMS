'use client';

import { Plus } from 'lucide-react';

import type { Collaborator, HeroSlide, HomeContent } from '@/lib/content-types';
import { Button } from '@/components/ui/button';
import { AdminPageHeader, EmptyState, ItemCard, SaveBar } from '@/components/admin/EditorChrome';
import { SelectField, TextField } from '@/components/admin/fields';
import { ImageField } from '@/components/admin/ImageField';
import { moveBy, removeAt, replaceAt, useContentEditor } from '@/components/admin/useContentEditor';

const emptySlide = (): HeroSlide => ({ src: '', alt: '' });

const emptyCollaborator = (): Collaborator => ({
  src: '',
  alt: '',
  name: '',
  width: 100,
  intrinsic: [400, 400],
  row: 1,
});

function SlideForm({
  slide,
  onChange,
}: {
  slide: HeroSlide;
  onChange: (slide: HeroSlide) => void;
}) {
  return (
    <>
      <ImageField
        label="Background image"
        value={slide.src}
        onChange={(src) => onChange({ ...slide, src })}
        destination="hero"
        nameHint={slide.alt}
        aspect="aspect-[16/9]"
        hint="Converted to WebP and resized to 2400px wide. Landscape photos work best — the hero crops to fill."
      />
      <TextField
        label="Alt text"
        value={slide.alt}
        onChange={(alt) => onChange({ ...slide, alt })}
        placeholder="CBRL Research Laboratory - Image 1"
        hint="Describes the photo for screen readers and when the image fails to load."
      />
    </>
  );
}

function CollaboratorForm({
  collaborator,
  onChange,
}: {
  collaborator: Collaborator;
  onChange: (collaborator: Collaborator) => void;
}) {
  const set = <K extends keyof Collaborator>(key: K, value: Collaborator[K]) =>
    onChange({ ...collaborator, [key]: value });

  return (
    <>
      <TextField
        label="Name"
        value={collaborator.name}
        onChange={(value) => set('name', value)}
        placeholder="AIIMS, Delhi"
        hint="The caption printed under the logo."
      />
      <ImageField
        label="Logo"
        value={collaborator.src}
        onChange={(src, size) =>
          onChange({
            ...collaborator,
            src,
            // An upload reports the encoded size, so the aspect ratio below
            // stays right without anyone having to measure the file.
            intrinsic: size ? [size.width, size.height] : collaborator.intrinsic,
          })
        }
        destination="collab"
        nameHint={collaborator.name}
        aspect="aspect-[3/2]"
        hint="PNG, JPEG or WebP — converted to WebP, and the source size below is filled in for you. SVG cannot be uploaded: put the file in public/images/Collab/ and type its path here."
      />
      <TextField
        label="Alt text"
        value={collaborator.alt}
        onChange={(value) => set('alt', value)}
        placeholder="AIIMS Delhi Logo"
      />
      <TextField
        label="Website (optional)"
        value={collaborator.href ?? ''}
        onChange={(value) => set('href', value)}
        placeholder="https://www.aiims.edu"
        hint="Leave blank to show the logo as plain text. With a link, the card opens the site in a new tab."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Row"
          value={String(collaborator.row)}
          options={[
            { value: '1', label: 'Row 1 — scrolls left' },
            { value: '2', label: 'Row 2 — scrolls right' },
          ]}
          onChange={(value) => set('row', value === '2' ? 2 : 1)}
        />
        <TextField
          label="Display width (px)"
          type="number"
          value={String(collaborator.width)}
          onChange={(value) => set('width', Number(value) || 0)}
          hint="How wide the logo is drawn. Most sit between 60 and 130."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Source width (px)"
          type="number"
          value={String(collaborator.intrinsic[0])}
          onChange={(value) =>
            set('intrinsic', [Number(value) || 0, collaborator.intrinsic[1]])
          }
          hint="The file's true pixel size, so the space is reserved correctly. Filled in automatically on upload."
        />
        <TextField
          label="Source height (px)"
          type="number"
          value={String(collaborator.intrinsic[1])}
          onChange={(value) =>
            set('intrinsic', [collaborator.intrinsic[0], Number(value) || 0])
          }
        />
      </div>
    </>
  );
}

export default function HomeEditor({ initial }: { initial: HomeContent }) {
  const editor = useContentEditor<HomeContent>(initial, '/api/admin/content/home');
  const { draft, setDraft } = editor;

  const slides = draft.hero.slides;
  const setSlides = (next: HeroSlide[]) => setDraft({ ...draft, hero: { ...draft.hero, slides: next } });
  const setCollaborators = (collaborators: Collaborator[]) => setDraft({ ...draft, collaborators });

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="Landing page"
        title="Home page"
        lead="The rotating background behind the hero, and the collaborating institutions that scroll past further down."
        page="/"
      />

      <section className="py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Hero background
          </p>
          <p className="text-xs text-muted-foreground">
            Shown in order, one every 5 seconds. The first is the one visitors see first, so make it
            the strongest.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {slides.length === 0 ? (
            <EmptyState>
              No background images — the hero needs at least one before this page can be saved.
            </EmptyState>
          ) : (
            slides.map((slide, index) => (
              <ItemCard
                key={index}
                index={index}
                total={slides.length}
                title={slide.alt || slide.src}
                subtitle={slide.src}
                badge={
                  index === 0 ? (
                    <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Shown first
                    </span>
                  ) : undefined
                }
                defaultOpen={!slide.src}
                removeLabel="Remove slide"
                onMove={(delta) => setSlides(moveBy(slides, index, delta))}
                onRemove={() => setSlides(removeAt(slides, index))}
              >
                <SlideForm
                  slide={slide}
                  onChange={(next) => setSlides(replaceAt(slides, index, next))}
                />
              </ItemCard>
            ))
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setSlides([...slides, emptySlide()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add background image
        </Button>
      </section>

      <section className="border-t py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Our collaborators
          </p>
          <p className="text-xs text-muted-foreground">
            Two rows scroll in opposite directions. Order within a row is the order listed here.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {draft.collaborators.length === 0 ? (
            <EmptyState>No collaborators listed — the section is hidden on the home page.</EmptyState>
          ) : (
            draft.collaborators.map((collaborator, index) => (
              <ItemCard
                key={index}
                index={index}
                total={draft.collaborators.length}
                title={collaborator.name}
                subtitle={collaborator.src}
                badge={
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Row {collaborator.row}
                  </span>
                }
                defaultOpen={!collaborator.name}
                removeLabel="Remove collaborator"
                onMove={(delta) => setCollaborators(moveBy(draft.collaborators, index, delta))}
                onRemove={() => setCollaborators(removeAt(draft.collaborators, index))}
              >
                <CollaboratorForm
                  collaborator={collaborator}
                  onChange={(next) =>
                    setCollaborators(replaceAt(draft.collaborators, index, next))
                  }
                />
              </ItemCard>
            ))
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setCollaborators([...draft.collaborators, emptyCollaborator()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add collaborator
        </Button>
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

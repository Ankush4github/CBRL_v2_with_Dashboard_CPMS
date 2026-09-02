'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { slugify, type GalleryAlbum, type GalleryContent } from '@/lib/content-types';
import { AdminPageHeader, EmptyState, ItemCard, SaveBar } from '@/components/admin/EditorChrome';
import {
  FieldSection,
  SelectField,
  StringListField,
  TextAreaField,
  TextField,
} from '@/components/admin/fields';
import { ImageField, uploadImage } from '@/components/admin/ImageField';
import { moveBy, removeAt, replaceAt, useContentEditor } from '@/components/admin/useContentEditor';

function emptyAlbum(existing: GalleryAlbum[], category: string): GalleryAlbum {
  return {
    id: existing.reduce((max, a) => Math.max(max, a.id), 0) + 1,
    title: '',
    caption: '',
    date: '',
    category,
    image: '',
    images: [],
    description: '',
    likes: 0,
    isLiked: false,
  };
}

/** Drop several photos into an album at once; each returns a stored path. */
function AlbumImages({
  album,
  onChange,
}: {
  album: GalleryAlbum;
  onChange: (images: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const images = album.images ?? [];
  const folder = slugify(album.title) || `album-${album.id}`;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        added.push((await uploadImage(file, 'gallery', { subfolder: folder })).path);
      }
      onChange([...images, ...added]);
    } catch (uploadError) {
      // Keep whatever made it through before the failure.
      if (added.length) onChange([...images, ...added]);
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Album photos
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">{images.length}</span>
      </div>

      {images.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          No photos yet — the lightbox will fall back to the cover image.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((src, index) => (
            <li key={`${src}-${index}`} className="group relative">
              <div className="relative aspect-square overflow-hidden rounded-md border bg-muted/40">
                <Image src={src} alt="" fill sizes="120px" className="object-cover" unoptimized />
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <div className="flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-6 text-xs"
                    aria-label={`Move photo ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => onChange(moveBy(images, index, -1))}
                  >
                    ‹
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-6 text-xs"
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={index === images.length - 1}
                    onClick={() => onChange(moveBy(images, index, 1))}
                  >
                    ›
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove photo ${index + 1}`}
                  onClick={() => onChange(removeAt(images, index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <ImagePlus className="h-3.5 w-3.5" />
              Add photos
            </>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          Saved to /images/gallery/{folder}/
        </span>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AlbumForm({
  album,
  categories,
  onChange,
}: {
  album: GalleryAlbum;
  categories: string[];
  onChange: (album: GalleryAlbum) => void;
}) {
  const set = <K extends keyof GalleryAlbum>(key: K, value: GalleryAlbum[K]) =>
    onChange({ ...album, [key]: value });

  return (
    <>
      <FieldSection title="Card">
        <TextField label="Title" value={album.title} onChange={(value) => set('title', value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Category"
            value={album.category}
            options={categories.map((c) => ({ value: c, label: c }))}
            onChange={(value) => set('category', value)}
          />
          <TextField
            label="Date"
            value={album.date}
            onChange={(value) => set('date', value)}
            placeholder="June 2025"
            hint="Free text — shown exactly as typed."
          />
        </div>
        <TextAreaField
          label="Caption"
          value={album.caption}
          onChange={(value) => set('caption', value)}
          rows={2}
          hint="Optional subtitle shown in the lightbox."
        />
        <TextAreaField
          label="Description"
          value={album.description}
          onChange={(value) => set('description', value)}
          rows={4}
        />
      </FieldSection>

      <FieldSection title="Images">
        <ImageField
          label="Cover image"
          value={album.image}
          onChange={(value) => set('image', value)}
          destination="gallery"
          subfolder={slugify(album.title) || `album-${album.id}`}
          nameHint={`${slugify(album.title) || 'album'}-cover`}
          aspect="aspect-[4/3]"
        />
        <AlbumImages album={album} onChange={(images) => set('images', images)} />
      </FieldSection>

      <FieldSection title="Likes" description="The heart count is decorative — visitor clicks are not stored.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Like count"
            type="number"
            value={String(album.likes)}
            onChange={(value) => set('likes', Number(value) || 0)}
          />
          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Heart shown filled
            </span>
            <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={album.isLiked}
                onChange={(event) => set('isLiked', event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Start filled in
            </label>
          </div>
        </div>
      </FieldSection>
    </>
  );
}

export default function GalleryEditor({ initial }: { initial: GalleryContent }) {
  const editor = useContentEditor<GalleryContent>(initial, '/api/admin/content/gallery');
  const { draft, setDraft } = editor;

  const setAlbums = (albums: GalleryAlbum[]) => setDraft({ ...draft, albums });

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="Archive"
        title="Gallery"
        lead="Albums shown on the gallery page, in order, with the photos behind each lightbox."
        page="/gallery"
        actions={
          <Button
            size="sm"
            onClick={() =>
              setAlbums([emptyAlbum(draft.albums, draft.categories[0] ?? ''), ...draft.albums])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add album
          </Button>
        }
      />

      <section className="border-b py-6">
        <StringListField
          label="Categories"
          values={draft.categories}
          onChange={(categories) => setDraft({ ...draft, categories })}
          addLabel="Add category"
          placeholder="Conferences"
          hint="These become the filter chips. “All” is added automatically."
        />
      </section>

      <div className="space-y-3 py-6">
        {draft.albums.length === 0 ? (
          <EmptyState>No albums yet.</EmptyState>
        ) : (
          draft.albums.map((album, index) => (
            <ItemCard
              key={album.id}
              index={index}
              total={draft.albums.length}
              title={album.title}
              subtitle={[album.category, album.date, `${album.images?.length ?? 0} photos`]
                .filter(Boolean)
                .join(' · ')}
              defaultOpen={!album.title}
              onMove={(delta) => setAlbums(moveBy(draft.albums, index, delta))}
              onRemove={() => setAlbums(removeAt(draft.albums, index))}
            >
              <AlbumForm
                album={album}
                categories={draft.categories}
                onChange={(next) => setAlbums(replaceAt(draft.albums, index, next))}
              />
            </ItemCard>
          ))
        )}
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

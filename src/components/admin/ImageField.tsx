'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImageOff, Loader2, Upload } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type UploadDestination =
  | 'members'
  | 'alumni'
  | 'facilities'
  | 'gallery'
  | 'sponsors'
  | 'hero'
  | 'collab'
  | 'pi';

/** The stored path plus the dimensions of the re-encoded file. */
export interface UploadedImage {
  path: string;
  width: number;
  height: number;
}

export async function uploadImage(
  file: File,
  destination: UploadDestination,
  options: { name?: string; subfolder?: string } = {}
): Promise<UploadedImage> {
  const form = new FormData();
  form.set('file', file);
  form.set('destination', destination);
  if (options.name) form.set('name', options.name);
  if (options.subfolder) form.set('subfolder', options.subfolder);

  const response = await fetch('/api/admin/upload', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error ?? `Upload failed (${response.status}).`);
  return { path: payload.path as string, width: payload.width, height: payload.height };
}

/**
 * Image path plus an upload button. Uploads are converted to WebP and given a
 * content-hashed filename by the API, so replacing a photo always produces a
 * new URL — `/images` is served with a one-year immutable cache.
 */
export function ImageField({
  label,
  value,
  onChange,
  destination,
  nameHint,
  subfolder,
  aspect = 'aspect-[4/5]',
  hint,
  className,
}: {
  label: string;
  value: string;
  /**
   * `size` carries the uploaded file's pixel dimensions, for records that store
   * an aspect ratio alongside the path. It is absent when the path is typed by
   * hand into the text input.
   */
  onChange: (path: string, size?: { width: number; height: number }) => void;
  destination: UploadDestination;
  /** Base filename for the upload, usually the record's name. */
  nameHint?: string;
  subfolder?: string;
  aspect?: string;
  /** Replaces the default note under the upload button. */
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, destination, { name: nameHint, subfolder });
      onChange(uploaded.path, { width: uploaded.width, height: uploaded.height });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>

      <div className="flex gap-4">
        <div
          className={cn(
            'relative w-28 shrink-0 overflow-hidden rounded-md border bg-muted/40',
            aspect
          )}
        >
          {value ? (
            <Image
              src={value}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
              // Freshly uploaded files are not in the optimizer's cache yet and
              // the preview is tiny either way.
              unoptimized
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <ImageOff className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={value}
            placeholder="/images/…"
            onChange={(event) => onChange(event.target.value)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
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
                  <Upload className="h-3.5 w-3.5" />
                  {value ? 'Replace image' : 'Upload image'}
                </>
              )}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => onChange('')}
              >
                Clear
              </Button>
            )}
          </div>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {hint ?? 'Converted to WebP and resized on upload.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

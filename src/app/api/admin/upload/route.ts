import crypto from 'node:crypto';
import path from 'node:path';

import { NextResponse, type NextRequest } from 'next/server';

import { refuseUnlessEditor } from '@/lib/admin-guard';
import { slugify } from '@/lib/content-types';
import { createClient } from '@/lib/supabase/server';

/**
 * Uploads land in the `site-media` Supabase bucket rather than `public/images`,
 * which lived inside the deployment artifact and did not survive a release.
 *
 * Existing content still references `/images/...` paths and keeps working —
 * those files remain committed under `public/` — so the two forms coexist and
 * nothing had to be migrated.
 */
const BUCKET = 'site-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

/**
 * Where each kind of image is allowed to land. A caller can only name one of
 * these keys, so no request can write outside `public/images`.
 */
const DESTINATIONS = {
  members: { dir: 'MembersDP', width: 900, allowSubfolder: false },
  alumni: { dir: 'AlumniDP', width: 900, allowSubfolder: false },
  facilities: { dir: 'facilities', width: 1600, allowSubfolder: false },
  gallery: { dir: 'gallery', width: 2000, allowSubfolder: true },
  sponsors: { dir: 'sponsors', width: 800, allowSubfolder: false },
  // Full-bleed hero backgrounds are rendered at 100vw, so they need headroom
  // for wide displays that the other destinations do not.
  hero: { dir: 'photo', width: 2400, allowSubfolder: false },
  collab: { dir: 'Collab', width: 800, allowSubfolder: false },
  // The PI portrait and the About-page hero backdrop.
  pi: { dir: 'pi', width: 1600, allowSubfolder: false },
} as const;

type DestinationKey = keyof typeof DESTINATIONS;

// `Object.hasOwn`, not `in`: `in` walks the prototype chain, so 'constructor',
// '__proto__', 'toString', 'valueOf' and 'hasOwnProperty' all satisfied it.
// `DESTINATIONS['constructor']` is then the Object constructor, whose `.dir` is
// undefined, and path.posix.join() throws on that — turning what should be a
// 400 "Unknown upload destination." into an unhandled 500.
const isDestination = (value: unknown): value is DestinationKey =>
  typeof value === 'string' && Object.hasOwn(DESTINATIONS, value);

export async function POST(request: NextRequest) {
  // Before the body is read: buffering 12 MB and decoding it costs the server
  // real work, and storage RLS only refuses a non-editor after that.
  const refused = await refuseUnlessEditor();
  if (refused) return refused;

  // `formData()` reads the whole body into memory, so refuse an oversized one
  // on its declared length before doing that rather than after.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES * 1.1) {
    return NextResponse.json({ error: 'That image is larger than 12 MB.' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Malformed upload.' }, { status: 400 });
  }

  const file = form.get('file');
  const destination = form.get('destination');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (!isDestination(destination)) {
    return NextResponse.json({ error: 'Unknown upload destination.' }, { status: 400 });
  }
  if (!ACCEPTED.has(file.type)) {
    return NextResponse.json(
      { error: 'Images only — JPEG, PNG, WebP, AVIF or GIF.' },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That image is larger than 12 MB.' }, { status: 413 });
  }

  const target = DESTINATIONS[destination];

  // Album images get their own folder, matching the existing layout under
  // /images/gallery. Slugified, so the value can never traverse.
  const subfolder = target.allowSubfolder ? slugify(String(form.get('subfolder') ?? '')) : '';
  const baseName = slugify(String(form.get('name') ?? '')) || slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';

  // Mirrors the old on-disk layout, so an object's key still reads the same way
  // the file path did: images/MembersDP/…, images/gallery/<album>/…
  const objectDir = path.posix.join('images', target.dir, subfolder);

  const input = Buffer.from(await file.arrayBuffer());

  // Re-encoding through sharp *is* the validation that these bytes are an
  // image — far stronger than the `Content-Type` the caller claimed, which is
  // simply whatever they typed. Anything sharp cannot read is refused, and the
  // extension is always `.webp` rather than something taken from the filename:
  // between them, no caller-supplied bytes can ever land in `public/` under a
  // caller-chosen extension and be served back from this origin.
  // The dimensions come back with the buffer so callers that have to reserve
  // space for the image (the collaborator logos) do not have to measure it.
  let output: Uint8Array;
  let dimensions: { width: number; height: number };
  try {
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: target.width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    output = data;
    dimensions = { width: info.width, height: info.height };
  } catch (error) {
    console.warn('Rejected an upload sharp could not decode:', error);
    return NextResponse.json(
      { error: 'That file could not be read as an image. Try a JPEG, PNG or WebP.' },
      { status: 422 }
    );
  }

  // Stored with a one-year immutable cache, so a replaced photo has to arrive
  // at a new URL or browsers would keep the old one all year.
  const digest = crypto.createHash('sha256').update(output).digest('hex').slice(0, 8);
  const objectPath = path.posix.join(objectDir, `${baseName}-${digest}.webp`);

  // The editor's own session, so the bucket's RLS policy re-checks the
  // site_editors grant. The gate in the proxy is not what authorises this.
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, output, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    // The name already contains a hash of the bytes, so a repeat upload is the
    // identical image. Overwriting is a no-op rather than a conflict to report.
    upsert: true,
  });

  if (uploadError) {
    console.error('Failed to store upload:', uploadError);
    return NextResponse.json(
      {
        error:
          'Could not store the image. If this persists, the signed-in account may no longer be a site editor.',
      },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

  return NextResponse.json({
    path: publicUrl,
    bytes: output.length,
    width: dimensions.width,
    height: dimensions.height,
  });
}

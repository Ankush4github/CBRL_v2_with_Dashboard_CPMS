import { NextResponse, type NextRequest } from 'next/server';

import { readPublicationsFile, writePublicationsFile } from '@/lib/content';
import {
  duplicateKeys,
  findEntry,
  formatEntry,
  parseEntryPayload,
  removeEntry,
  replaceEntry,
  splitEntries,
} from '@/lib/bibtex-entries';
import { summarise } from '@/lib/publications-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const source = await readPublicationsFile();
  const entries = splitEntries(source);
  const entry = entries.find((e) => e.id === decodeURIComponent(id));

  if (!entry) {
    return NextResponse.json({ error: 'That publication no longer exists.' }, { status: 404 });
  }

  return NextResponse.json(
    {
      entry: {
        ...summarise(entry, duplicateKeys(entries)),
        fields: entry.fields,
        raw: entry.raw,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const entryId = decodeURIComponent(id);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const source = await readPublicationsFile();
  if (!findEntry(source, entryId)) {
    return NextResponse.json({ error: 'That publication no longer exists.' }, { status: 404 });
  }

  const result = parseEntryPayload(body, source);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const { type, key, fields } = result.value;

  try {
    await writePublicationsFile(
      replaceEntry(source, entryId, formatEntry(type, key, fields))
    );
  } catch (error) {
    console.error('Failed to update publication:', error);
    return NextResponse.json({ error: 'Could not save the publication.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, key });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const entryId = decodeURIComponent(id);
  const source = await readPublicationsFile();

  if (!findEntry(source, entryId)) {
    return NextResponse.json({ error: 'That publication no longer exists.' }, { status: 404 });
  }

  try {
    await writePublicationsFile(removeEntry(source, entryId));
  } catch (error) {
    console.error('Failed to delete publication:', error);
    return NextResponse.json({ error: 'Could not save the publication.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

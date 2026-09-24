import { NextResponse, type NextRequest } from 'next/server';

import { readPublicationsForEdit, writePublicationsFile } from '@/lib/content';
import { contentUnavailable } from '@/lib/content-unavailable';
import {
  duplicateKeys,
  formatEntry,
  parseEntryPayload,
  prependEntry,
  splitEntries,
} from '@/lib/bibtex-entries';
import { summarise } from '@/lib/publications-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const source = await readPublicationsForEdit().catch(contentUnavailable);
  if (source instanceof NextResponse) return source;
  const entries = splitEntries(source);
  const duplicates = duplicateKeys(entries);

  return NextResponse.json(
    { entries: entries.map((entry) => summarise(entry, duplicates)) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const source = await readPublicationsForEdit().catch(contentUnavailable);
  if (source instanceof NextResponse) return source;
  const payload = (body ?? {}) as Record<string, unknown>;

  // Two ways in: a filled-in form, or BibTeX pasted straight from the publisher.
  if (typeof payload.raw === 'string' && payload.raw.trim()) {
    const parsed = splitEntries(payload.raw);
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: 'That does not look like a BibTeX entry — it should start with @article{…' },
        { status: 422 }
      );
    }

    let next = source;
    const added: string[] = [];
    // Reversed so a multi-entry paste keeps its own order once each is prepended.
    for (const entry of [...parsed].reverse()) {
      const result = parseEntryPayload(
        { type: entry.type, key: entry.key, fields: entry.fields },
        next
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

      next = prependEntry(
        next,
        formatEntry(result.value.type, result.value.key, result.value.fields)
      );
      added.push(result.value.key);
    }

    try {
      await writePublicationsFile(next);
    } catch (error) {
      console.error('Failed to import publications:', error);
      return NextResponse.json({ error: 'Could not save the publications.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, added });
  }

  const result = parseEntryPayload(payload, source);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const { type, key, fields } = result.value;

  // Wrapped for the same reason as the two handlers in ./[id]/route.ts: the
  // error that save() throws carries the raw PostgREST message, and letting it
  // escape hands the response to the framework's own 500 path instead of this
  // route's. That path answers safely, but it also means the failure reads
  // differently here than everywhere else in the dashboard.
  try {
    await writePublicationsFile(prependEntry(source, formatEntry(type, key, fields)));
  } catch (error) {
    console.error('Failed to add publication:', error);
    return NextResponse.json({ error: 'Could not save the publication.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added: [key] });
}

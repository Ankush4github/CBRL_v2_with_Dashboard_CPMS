import { NextResponse, type NextRequest } from 'next/server';

import { readContentForEdit, writeContent } from '@/lib/content';
import { contentUnavailable } from '@/lib/content-unavailable';
import { validateContent } from '@/lib/content-schema';
import { isContentCollection } from '@/lib/content-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ collection: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { collection } = await params;
  if (!isContentCollection(collection)) {
    return NextResponse.json({ error: 'Unknown content section.' }, { status: 404 });
  }

  const data = await readContentForEdit(collection).catch(contentUnavailable);
  if (data instanceof NextResponse) return data;

  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { collection } = await params;
  if (!isContentCollection(collection)) {
    return NextResponse.json({ error: 'Unknown content section.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const result = validateContent(collection, body);
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Some fields need attention before this can be saved.', issues: result.issues },
      { status: 422 }
    );
  }

  try {
    await writeContent(collection, result.value);
  } catch (error) {
    console.error(`Failed to save ${collection}:`, error);
    return NextResponse.json(
      {
        error:
          'Could not save your changes. If this keeps happening, the signed-in account may no longer be a site editor.',
      },
      { status: 500 }
    );
  }

  // Hand back the normalised document so the editor reflects exactly what is
  // now on disk — trimmed strings, dropped blanks, de-duplicated ids.
  return NextResponse.json({ data: result.value, savedAt: new Date().toISOString() });
}

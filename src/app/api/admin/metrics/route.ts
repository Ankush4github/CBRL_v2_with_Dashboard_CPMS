import { NextResponse, type NextRequest } from 'next/server';

import { getMetrics, writeMetrics } from '@/lib/content';
import { validateMetrics } from '@/lib/content-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { data: await getMetrics() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const result = validateMetrics(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Some fields need attention before this can be saved.', issues: result.issues },
      { status: 422 }
    );
  }

  try {
    await writeMetrics(result.value);
  } catch (error) {
    console.error('Failed to save metrics:', error);
    return NextResponse.json(
      {
        error:
          'Could not save your changes. If this keeps happening, the signed-in account may no longer be a site editor.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: result.value, savedAt: new Date().toISOString() });
}

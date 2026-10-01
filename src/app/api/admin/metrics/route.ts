import { NextResponse, type NextRequest } from 'next/server';

import { getMetricsForEdit, writeMetrics } from '@/lib/content';
import { contentUnavailable } from '@/lib/content-unavailable';
import { validateMetrics } from '@/lib/content-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getMetricsForEdit().catch(contentUnavailable);
  if (data instanceof NextResponse) return data;

  return NextResponse.json(
    { data },
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

/**
 * Saves arrive as POST. CIC's Apache in front of the site answers PUT, PATCH
 * and DELETE with its own 403 before they reach Node, so the dashboard cannot
 * send them; PUT stays for local development and anything calling it directly.
 */
export const POST = PUT;

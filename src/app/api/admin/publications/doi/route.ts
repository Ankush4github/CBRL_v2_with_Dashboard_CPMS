import { NextResponse, type NextRequest } from 'next/server';

import { splitEntries } from '@/lib/bibtex-entries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fetch an entry from doi.org content negotiation, which hands back BibTeX for
 * any registered DOI. Runs server-side, so the page's `connect-src` CSP does
 * not apply and the browser never talks to a third party.
 */
export async function POST(request: NextRequest) {
  let doi = '';
  try {
    const body = await request.json();
    doi = String(body?.doi ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '').trim();
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
    return NextResponse.json(
      { error: 'That does not look like a DOI. Expected something like 10.1016/j.bios.2026.118980' },
      { status: 422 }
    );
  }

  let response: Response;
  try {
    response = await fetch(`https://doi.org/${encodeURI(doi)}`, {
      headers: {
        Accept: 'application/x-bibtex; charset=utf-8',
        'User-Agent': 'CBRL-Dashboard (https://cbrl.iitkgp.ac.in; mailto:contact.cbrl@smst.iitkgp.ac.in)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not reach doi.org. Check the server’s internet access, or paste the BibTeX instead.' },
      { status: 502 }
    );
  }

  if (response.status === 404) {
    return NextResponse.json({ error: 'No record found for that DOI.' }, { status: 404 });
  }
  if (!response.ok) {
    return NextResponse.json(
      { error: `doi.org replied ${response.status}. Try again, or paste the BibTeX instead.` },
      { status: 502 }
    );
  }

  const bibtex = await response.text();
  const parsed = splitEntries(bibtex);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: 'doi.org returned something that is not BibTeX.' },
      { status: 502 }
    );
  }

  const entry = parsed[0];
  return NextResponse.json({
    entry: { type: entry.type, key: entry.key, fields: entry.fields },
    raw: entry.raw,
  });
}

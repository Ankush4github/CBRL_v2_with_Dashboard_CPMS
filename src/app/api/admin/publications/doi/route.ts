import { NextResponse, type NextRequest } from 'next/server';

import { refuseUnlessEditor } from '@/lib/admin-guard';
import { splitEntries } from '@/lib/bibtex-entries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fetch an entry from doi.org content negotiation, which hands back BibTeX for
 * any registered DOI. Runs server-side, so the page's `connect-src` CSP does
 * not apply and the browser never talks to a third party.
 */

/**
 * Where doi.org's content negotiation hands off to. It answers with a redirect
 * to the registration agency's metadata service, and for a DOI whose agency
 * does not negotiate it redirects to the publisher's landing page instead —
 * whatever URL the registrant set, which can be anything, including an
 * address on the campus network. Following only these hosts keeps the server
 * from fetching arbitrary URLs on an editor's behalf; a landing page would
 * never have returned BibTeX anyway.
 */
const METADATA_HOSTS = new Set([
  'doi.org',
  'api.crossref.org',
  'data.crossref.org',
  'api.datacite.org',
  'data.datacite.org',
  'data.medra.org',
]);
const MAX_REDIRECTS = 5;
/** BibTeX for one entry is a few KB; anything this size is not that. */
const MAX_BODY_BYTES = 1024 * 1024;

async function fetchMetadata(url: string): Promise<Response | 'refused'> {
  let next = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = new URL(next);
    if (target.protocol !== 'https:' || !METADATA_HOSTS.has(target.hostname)) return 'refused';

    const response = await fetch(target, {
      headers: {
        Accept: 'application/x-bibtex; charset=utf-8',
        'User-Agent': 'CBRL-Dashboard (https://cbrl.iitkgp.ac.in; mailto:contact.cbrl@smst.iitkgp.ac.in)',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    });

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      next = new URL(location, target).toString();
      continue;
    }
    return response;
  }
  return 'refused';
}

/** The body as text, or null once it passes MAX_BODY_BYTES. */
async function readCapped(response: Response): Promise<string | null> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: NextRequest) {
  const refused = await refuseUnlessEditor();
  if (refused) return refused;

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

  let response: Response | 'refused';
  try {
    response = await fetchMetadata(`https://doi.org/${encodeURI(doi)}`);
  } catch {
    return NextResponse.json(
      { error: 'Could not reach doi.org. Check the server’s internet access, or paste the BibTeX instead.' },
      { status: 502 }
    );
  }

  if (response === 'refused') {
    return NextResponse.json(
      { error: 'doi.org has no BibTeX for that DOI. Paste the BibTeX instead.' },
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

  const bibtex = await readCapped(response);
  const parsed = bibtex === null ? [] : splitEntries(bibtex);
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

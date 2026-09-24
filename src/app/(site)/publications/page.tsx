import { getMetrics, readPublicationsFile } from '@/lib/content';
import { jsonLd } from '@/lib/json-ld';
import { parseBibTeX, type Publication } from '@/lib/bibtex-parser';
import PublicationsClient, { type PublicationMetrics } from './PublicationsClient';
import { generatePublicationsJsonLd } from './publications-jsonld';

// Read and parse on the server so the full publication list is present in the
// rendered HTML rather than arriving after a client-side fetch.
async function loadPublications(): Promise<Publication[]> {
  return parseBibTeX(await readPublicationsFile());
}

async function loadMetrics(): Promise<PublicationMetrics> {
  const data = await getMetrics();

  return {
    totalCitations: data?.totalCitations ?? null,
    hIndex: typeof data?.hIndex === 'number' ? data.hIndex : null,
    sourceName: data?.source?.name ?? null,
    sourceUrl: data?.source?.url ?? null,
    lastUpdated: data?.lastUpdated ?? null,
  };
}

export default async function PublicationsPage() {
  const [publications, metrics] = await Promise.all([loadPublications(), loadMetrics()]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(generatePublicationsJsonLd(publications)),
        }}
      />
      <PublicationsClient publications={publications} metrics={metrics} />
    </>
  );
}

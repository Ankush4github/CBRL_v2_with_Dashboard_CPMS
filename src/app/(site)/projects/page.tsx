import { getProjects, getResearch } from '@/lib/content';
import { projectAnchor, projectArea } from '@/lib/research-links';
import { jsonLd } from '@/lib/json-ld';
import { COMPLETED_PROJECTS_FALLBACK } from '@/lib/content-types';
import ProjectsClient, { type ProjectAreaTag } from './ProjectsClient';

export default async function Projects() {
  const [{ ongoing, completedPdf, completedCount, sponsors }, { areas: researchAreas }] = await Promise.all([
    getProjects(),
    getResearch(),
  ]);
  // Resolved here so the client receives only an id → area label map.
  const areas: Record<number, ProjectAreaTag | undefined> = {};
  for (const p of ongoing) {
    const a = projectArea(p, researchAreas);
    areas[p.id] = a ? { id: a.id, title: a.title } : undefined;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'CBRL Research Projects',
            itemListElement: ongoing.map((p, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              item: {
                '@type': 'ResearchProject',
                name: p.title,
                description: p.shortDescription,
                sponsor: { '@type': 'Organization', name: p.funding },
                startDate: p.duration?.split(' to ')[0] || undefined,
                endDate: p.duration?.split(' to ')[1] || undefined,
                funder: { '@type': 'Organization', name: p.funding },
                url: `https://cbrl.iitkgp.ac.in/projects#${projectAnchor(p)}`,
              },
            })),
          }),
        }}
      />

      <ProjectsClient ongoing={ongoing} completedPdf={completedPdf} completedCount={completedCount ?? COMPLETED_PROJECTS_FALLBACK} sponsors={sponsors} areas={areas} />
    </>
  );
}

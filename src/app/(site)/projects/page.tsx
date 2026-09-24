import { getProjects } from '@/lib/content';
import { jsonLd } from '@/lib/json-ld';
import ProjectsClient from './ProjectsClient';

export default async function Projects() {
  const { ongoing, completedPdf, sponsors } = await getProjects();

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
                url: 'https://cbrl.iitkgp.ac.in/projects',
              },
            })),
          }),
        }}
      />

      <ProjectsClient ongoing={ongoing} completedPdf={completedPdf} sponsors={sponsors} />
    </>
  );
}

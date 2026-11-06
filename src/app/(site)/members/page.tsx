import PageHeader from '@/components/PageHeader';
import { getMembers } from '@/lib/content';
import { jsonLd } from '@/lib/json-ld';
import TeamDirectory from './TeamDirectory';
import { generateMembersJsonLd } from './members-data';

export default async function Members() {
  const members = await getMembers();

  return (
    <div className="bg-background">
      {/* The team as structured data. Here rather than in the layout, which
          also wraps every /members/[id] profile page. */}
      {generateMembersJsonLd(members).map((schema, index) => (
        <script
          key={`jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
        />
      ))}

      <PageHeader
        eyebrow="Team"
        title="Our team"
        lead="Faculty, researchers, students, staff, and alumni of the Clinical Biomarker Research Laboratory."
      />

      <TeamDirectory members={members} />
    </div>
  );
}

'use client';

import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Project, ProjectsContent, Sponsor } from '@/lib/content-types';
import { AdminPageHeader, EmptyState, ItemCard, SaveBar } from '@/components/admin/EditorChrome';
import {
  FieldSection,
  StringListField,
  TextAreaField,
  TextField,
} from '@/components/admin/fields';
import { ImageField } from '@/components/admin/ImageField';
import { moveBy, removeAt, replaceAt, useContentEditor } from '@/components/admin/useContentEditor';

function emptyProject(existing: Project[]): Project {
  return {
    id: existing.reduce((max, p) => Math.max(max, p.id), 0) + 1,
    title: '',
    icon: '🔬',
    shortDescription: '',
    duration: '',
    funding: '',
    role: 'Principal Investigator',
    detailedDescription: '',
    objectives: [],
    methodology: '',
    expectedOutcomes: '',
  };
}

function ProjectForm({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const set = <K extends keyof Project>(key: K, value: Project[K]) =>
    onChange({ ...project, [key]: value });

  return (
    <>
      <FieldSection title="Summary" description="What the projects list shows before Read More.">
        <TextAreaField
          label="Title"
          value={project.title}
          onChange={(value) => set('title', value)}
          rows={2}
        />
        <TextAreaField
          label="Short description"
          value={project.shortDescription}
          onChange={(value) => set('shortDescription', value)}
          rows={3}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Duration"
            value={project.duration}
            onChange={(value) => set('duration', value)}
            placeholder="05-02-2025 to 04-02-2028"
            hint="Split on “ to ” for structured data."
          />
          <TextField
            label="Funding agency"
            value={project.funding}
            onChange={(value) => set('funding', value)}
            placeholder="Indian Council of Medical Research (ICMR)"
          />
          <TextField
            label="Role"
            value={project.role}
            onChange={(value) => set('role', value)}
            placeholder="Principal Investigator"
          />
        </div>
        <TextField
          label="Icon"
          value={project.icon}
          onChange={(value) => set('icon', value)}
          placeholder="🧬"
          hint="A single emoji. Not currently shown on the page, kept for structured data."
        />
      </FieldSection>

      <FieldSection title="Detail" description="The dialog opened by Read More.">
        <TextAreaField
          label="Project overview"
          value={project.detailedDescription}
          onChange={(value) => set('detailedDescription', value)}
          rows={5}
        />
        <StringListField
          label="Key objectives"
          values={project.objectives}
          onChange={(values) => set('objectives', values)}
          addLabel="Add objective"
          multiline
        />
        <TextAreaField
          label="Methodology"
          value={project.methodology}
          onChange={(value) => set('methodology', value)}
          rows={4}
        />
        <TextAreaField
          label="Expected outcomes"
          value={project.expectedOutcomes}
          onChange={(value) => set('expectedOutcomes', value)}
          rows={4}
        />
      </FieldSection>
    </>
  );
}

function SponsorForm({
  sponsor,
  onChange,
}: {
  sponsor: Sponsor;
  onChange: (sponsor: Sponsor) => void;
}) {
  return (
    <>
      <TextField
        label="Name"
        value={sponsor.alt}
        onChange={(value) => onChange({ ...sponsor, alt: value })}
        placeholder="Indian Council of Medical Research"
        hint="Used as the logo's alt text."
      />
      <ImageField
        label="Logo"
        value={sponsor.src}
        onChange={(value) => onChange({ ...sponsor, src: value })}
        destination="sponsors"
        aspect="aspect-[3/2]"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Width (px)"
          type="number"
          value={String(sponsor.width)}
          onChange={(value) => onChange({ ...sponsor, width: Number(value) || 0 })}
          hint="The file's true pixel size, so the space is reserved correctly."
        />
        <TextField
          label="Height (px)"
          type="number"
          value={String(sponsor.height)}
          onChange={(value) => onChange({ ...sponsor, height: Number(value) || 0 })}
        />
      </div>
    </>
  );
}

export default function ProjectsEditor({ initial }: { initial: ProjectsContent }) {
  const editor = useContentEditor<ProjectsContent>(initial, '/api/admin/content/projects');
  const { draft, setDraft } = editor;

  const setOngoing = (ongoing: Project[]) => setDraft({ ...draft, ongoing });
  const setSponsors = (sponsors: Sponsor[]) => setDraft({ ...draft, sponsors });

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="Funded research register"
        title="Projects"
        lead="Ongoing projects, the completed-projects PDF, and the funding-partner logos."
        page="/projects"
        actions={
          <Button size="sm" onClick={() => setOngoing([emptyProject(draft.ongoing), ...draft.ongoing])}>
            <Plus className="h-3.5 w-3.5" />
            Add project
          </Button>
        }
      />

      <section className="py-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Ongoing projects
        </p>
        <div className="mt-4 space-y-3">
          {draft.ongoing.length === 0 ? (
            <EmptyState>No ongoing projects listed.</EmptyState>
          ) : (
            draft.ongoing.map((project, index) => (
              <ItemCard
                key={project.id}
                index={index}
                total={draft.ongoing.length}
                title={project.title}
                subtitle={[project.funding, project.duration].filter(Boolean).join(' · ')}
                defaultOpen={!project.title}
                onMove={(delta) => setOngoing(moveBy(draft.ongoing, index, delta))}
                onRemove={() => setOngoing(removeAt(draft.ongoing, index))}
              >
                <ProjectForm
                  project={project}
                  onChange={(next) => setOngoing(replaceAt(draft.ongoing, index, next))}
                />
              </ItemCard>
            ))
          )}
        </div>
      </section>

      <section className="border-t py-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Completed projects
        </p>
        <div className="mt-4 rounded-lg border bg-card p-5">
          <TextField
            label="PDF path"
            value={draft.completedPdf}
            onChange={(value) => setDraft({ ...draft, completedPdf: value })}
            placeholder="/data/completed-projects.pdf"
            hint="A file in public/. Replace the PDF on the server to update the list."
          />
        </div>
      </section>

      <section className="border-t py-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Funding partners
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSponsors([...draft.sponsors, { src: '', alt: '', width: 300, height: 150 }])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add sponsor
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {draft.sponsors.length === 0 ? (
            <EmptyState>No sponsor logos.</EmptyState>
          ) : (
            draft.sponsors.map((sponsor, index) => (
              <ItemCard
                key={index}
                index={index}
                total={draft.sponsors.length}
                title={sponsor.alt}
                subtitle={sponsor.src}
                defaultOpen={!sponsor.src}
                onMove={(delta) => setSponsors(moveBy(draft.sponsors, index, delta))}
                onRemove={() => setSponsors(removeAt(draft.sponsors, index))}
              >
                <SponsorForm
                  sponsor={sponsor}
                  onChange={(next) => setSponsors(replaceAt(draft.sponsors, index, next))}
                />
              </ItemCard>
            ))
          )}
        </div>
      </section>

      <SaveBar
        dirty={editor.dirty}
        state={editor.state}
        error={editor.error}
        issues={editor.issues}
        savedAt={editor.savedAt}
        onSave={editor.save}
        onRevert={editor.revert}
      />
    </div>
  );
}

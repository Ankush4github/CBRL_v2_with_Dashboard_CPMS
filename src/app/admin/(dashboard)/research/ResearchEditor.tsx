'use client';

import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { slugify, type ResearchArea, type ResearchContent, type ResearchTopic } from '@/lib/content-types';
import { AdminPageHeader, EmptyState, ItemCard, SaveBar } from '@/components/admin/EditorChrome';
import { FieldSection, StringListField, TextAreaField, TextField } from '@/components/admin/fields';
import { moveBy, removeAt, replaceAt, useContentEditor } from '@/components/admin/useContentEditor';

function emptyTopic(): ResearchTopic {
  return { id: '', title: '', summary: '', body: [''] };
}

function TopicForm({
  topic,
  onChange,
}: {
  topic: ResearchTopic;
  onChange: (topic: ResearchTopic) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Disease / topic"
          value={topic.title}
          onChange={(value) => onChange({ ...topic, title: value })}
          placeholder="Polycystic Ovary Syndrome (PCOS)"
        />
        <TextField
          label="Summary line"
          value={topic.summary}
          onChange={(value) => onChange({ ...topic, summary: value })}
          placeholder="Omics based serum biomarkers"
          hint="The small caption under the accordion heading."
        />
      </div>

      <StringListField
        label="Body paragraphs"
        values={topic.body}
        onChange={(values) => onChange({ ...topic, body: values })}
        addLabel="Add paragraph"
        multiline
        hint="Each entry becomes its own paragraph inside the accordion."
      />
    </>
  );
}

function AreaEditor({
  area,
  onChange,
}: {
  area: ResearchArea;
  onChange: (area: ResearchArea) => void;
}) {
  const setTopics = (topics: ResearchTopic[]) => onChange({ ...area, topics });

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-5">
        <FieldSection title={`Area ${area.index}`}>
          <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
            <TextField
              label="Number"
              value={area.index}
              onChange={(value) => onChange({ ...area, index: value })}
              placeholder="01"
            />
            <TextField
              label="Title"
              value={area.title}
              onChange={(value) => onChange({ ...area, title: value })}
            />
          </div>
          <TextField
            label="Tagline"
            value={area.tagline}
            onChange={(value) => onChange({ ...area, tagline: value })}
            hint="The small primary-coloured line above the title."
          />
          <TextAreaField
            label="Description"
            value={area.description}
            onChange={(value) => onChange({ ...area, description: value })}
            rows={3}
          />
          <TextField
            label="Section anchor"
            value={area.id}
            onChange={(value) => onChange({ ...area, id: slugify(value) })}
            hint={`The navigation links to /research#${area.id || 'anchor'}.`}
          />
        </FieldSection>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Disease areas in focus
            <span className="ml-1.5 tabular-nums opacity-60">{area.topics.length}</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTopics([...area.topics, emptyTopic()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add topic
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {area.topics.length === 0 ? (
            <EmptyState>No topics in this area yet.</EmptyState>
          ) : (
            area.topics.map((topic, index) => (
              <ItemCard
                key={`${area.id}-${index}`}
                index={index}
                total={area.topics.length}
                title={topic.title}
                subtitle={topic.summary}
                defaultOpen={!topic.title}
                onMove={(delta) => setTopics(moveBy(area.topics, index, delta))}
                onRemove={() => setTopics(removeAt(area.topics, index))}
              >
                <TopicForm
                  topic={topic}
                  onChange={(next) => setTopics(replaceAt(area.topics, index, next))}
                />
              </ItemCard>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResearchEditor({ initial }: { initial: ResearchContent }) {
  const editor = useContentEditor<ResearchContent>(initial, '/api/admin/content/research');
  const { draft, setDraft } = editor;

  const setAreas = (areas: ResearchArea[]) => setDraft({ ...draft, areas });

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="Diseases in focus"
        title="Research areas"
        lead="The two research areas and the disease write-ups inside each accordion."
        page="/research"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setAreas([
                ...draft.areas,
                {
                  id: '',
                  index: String(draft.areas.length + 1).padStart(2, '0'),
                  title: '',
                  tagline: '',
                  description: '',
                  topics: [],
                },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add area
          </Button>
        }
      />

      <div className="space-y-6 py-6">
        {draft.areas.length === 0 ? (
          <EmptyState>No research areas defined.</EmptyState>
        ) : (
          draft.areas.map((area, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => setAreas(moveBy(draft.areas, index, -1))}
                >
                  Move up
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={index === draft.areas.length - 1}
                  onClick={() => setAreas(moveBy(draft.areas, index, 1))}
                >
                  Move down
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setAreas(removeAt(draft.areas, index))}
                >
                  Remove area
                </Button>
              </div>
              <AreaEditor
                area={area}
                onChange={(next) => setAreas(replaceAt(draft.areas, index, next))}
              />
            </div>
          ))
        )}
      </div>

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

'use client';

import { Button } from '@/components/ui/button';
import type { MetricsContent } from '@/lib/content-types';
import { AdminPageHeader, SaveBar } from '@/components/admin/EditorChrome';
import { FieldSection, TextField } from '@/components/admin/fields';
import { useContentEditor } from '@/components/admin/useContentEditor';

export default function MetricsEditor({ initial }: { initial: MetricsContent }) {
  const editor = useContentEditor<MetricsContent>(initial, '/api/admin/metrics');
  const { draft, setDraft } = editor;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="pb-4">
      <AdminPageHeader
        eyebrow="Publications page"
        title="Citation metrics"
        lead="The citation count and h-index shown above the publication list. Copy them from Google Scholar whenever they move."
        page="/publications"
        actions={
          draft.source.url ? (
            <Button asChild variant="outline" size="sm">
              <a href={draft.source.url} target="_blank" rel="noopener noreferrer">
                Open Scholar
              </a>
            </Button>
          ) : undefined
        }
      />

      <div className="max-w-2xl space-y-6 py-8">
        <FieldSection title="Figures">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Total citations"
              value={draft.totalCitations}
              onChange={(value) => setDraft({ ...draft, totalCitations: value })}
              placeholder="7000+"
              hint="Text, so a rounded figure like “7000+” works."
            />
            <TextField
              label="h-index"
              type="number"
              value={String(draft.hIndex)}
              onChange={(value) => setDraft({ ...draft, hIndex: Number(value) || 0 })}
            />
          </div>
        </FieldSection>

        <FieldSection title="Source">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Name"
              value={draft.source.name}
              onChange={(value) => setDraft({ ...draft, source: { ...draft.source, name: value } })}
              placeholder="Google Scholar"
            />
            <TextField
              label="Profile URL"
              value={draft.source.url}
              onChange={(value) => setDraft({ ...draft, source: { ...draft.source, url: value } })}
              placeholder="https://scholar.google.com/citations?user=…"
            />
          </div>
        </FieldSection>

        <FieldSection title="Freshness">
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Last updated"
              type="date"
              value={draft.lastUpdated}
              onChange={(value) => setDraft({ ...draft, lastUpdated: value })}
              className="flex-1"
              hint="Shown next to the figures so readers know how current they are."
            />
            <Button
              variant="outline"
              size="sm"
              disabled={draft.lastUpdated === today}
              onClick={() => setDraft({ ...draft, lastUpdated: today })}
            >
              Set to today
            </Button>
          </div>
        </FieldSection>
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

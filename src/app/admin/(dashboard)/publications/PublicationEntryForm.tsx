'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CORE_FIELDS, ENTRY_TYPES, type BibField } from '@/lib/bibtex-entries';
import { FieldSection, SelectField, TextAreaField, TextField } from '@/components/admin/fields';
import { removeAt, replaceAt } from '@/components/admin/useContentEditor';

export interface EntryDraft {
  type: string;
  key: string;
  fields: BibField[];
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  author: 'Authors',
  journal: 'Journal',
  booktitle: 'Book / proceedings title',
  year: 'Year',
  volume: 'Volume',
  number: 'Issue number',
  pages: 'Pages',
  publisher: 'Publisher',
  editor: 'Editors',
  doi: 'DOI',
  url: 'URL',
};

const WIDE_FIELDS = new Set(['title', 'author', 'editor', 'booktitle']);

export function emptyEntry(): EntryDraft {
  return {
    type: 'article',
    key: '',
    fields: [
      { name: 'title', value: '' },
      { name: 'author', value: '' },
      { name: 'journal', value: '' },
      { name: 'year', value: '' },
      { name: 'doi', value: '' },
    ],
  };
}

const valueOf = (fields: BibField[], name: string) =>
  fields.find((f) => f.name === name)?.value ?? '';

/** Set a field, appending it if the entry does not carry it yet. */
function setField(fields: BibField[], name: string, value: string): BibField[] {
  const index = fields.findIndex((f) => f.name === name);
  if (index === -1) return [...fields, { name, value }];
  return replaceAt(fields, index, { name, value });
}

/**
 * Form over one BibTeX entry. Fields the site renders get proper inputs;
 * everything else the publisher supplied — keywords, issn, abstract — is listed
 * underneath so a save never quietly drops it.
 */
export default function PublicationEntryForm({
  draft,
  onChange,
}: {
  draft: EntryDraft;
  onChange: (draft: EntryDraft) => void;
}) {
  const [newFieldName, setNewFieldName] = useState('');

  const core = new Set<string>(CORE_FIELDS);
  const extras = draft.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !core.has(field.name));

  const update = (name: string, value: string) =>
    onChange({ ...draft, fields: setField(draft.fields, name, value) });

  return (
    <div className="space-y-6">
      <FieldSection title="Record">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Entry type"
            value={draft.type}
            options={ENTRY_TYPES.map((type) => ({ value: type, label: type }))}
            onChange={(type) => onChange({ ...draft, type })}
          />
          <TextField
            label="Citation key"
            value={draft.key}
            onChange={(key) => onChange({ ...draft, key })}
            placeholder="Left blank, one is generated"
            hint="Internal identifier only — never shown on the site."
          />
        </div>

        {CORE_FIELDS.map((name) =>
          WIDE_FIELDS.has(name) ? (
            <TextAreaField
              key={name}
              label={FIELD_LABELS[name] ?? name}
              value={valueOf(draft.fields, name)}
              onChange={(value) => update(name, value)}
              rows={name === 'title' ? 2 : 3}
              hint={
                name === 'author'
                  ? 'BibTeX style: “Jane Doe and John Roe”, or “Doe, Jane and Roe, John”.'
                  : undefined
              }
            />
          ) : null
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {CORE_FIELDS.filter((name) => !WIDE_FIELDS.has(name)).map((name) => (
            <TextField
              key={name}
              label={FIELD_LABELS[name] ?? name}
              value={valueOf(draft.fields, name)}
              onChange={(value) => update(name, value)}
              placeholder={name === 'doi' ? '10.1016/j.bios.2026.118980' : undefined}
            />
          ))}
        </div>
      </FieldSection>

      <FieldSection
        title="Other BibTeX fields"
        description="Kept exactly as they are unless you change them here."
      >
        {extras.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
            This entry has no additional fields.
          </p>
        ) : (
          <ul className="space-y-2">
            {extras.map(({ field, index }) => (
              <li key={index} className="flex items-start gap-2">
                <Input
                  value={field.name}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      fields: replaceAt(draft.fields, index, {
                        ...field,
                        name: event.target.value.toLowerCase(),
                      }),
                    })
                  }
                  className="w-40 shrink-0 font-mono text-xs"
                />
                <Input
                  value={field.value}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      fields: replaceAt(draft.fields, index, { ...field, value: event.target.value }),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${field.name}`}
                  onClick={() => onChange({ ...draft, fields: removeAt(draft.fields, index) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={newFieldName}
            onChange={(event) => setNewFieldName(event.target.value)}
            placeholder="keywords"
            className="w-40 font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!newFieldName.trim()}
            onClick={() => {
              onChange({
                ...draft,
                fields: [...draft.fields, { name: newFieldName.trim().toLowerCase(), value: '' }],
              });
              setNewFieldName('');
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add field
          </Button>
        </div>
      </FieldSection>
    </div>
  );
}

import type { BibEntry } from './bibtex-entries';

/** The row shape the publications list renders — one line per entry. */
export interface PublicationSummary {
  id: string;
  key: string;
  type: string;
  title: string;
  author: string;
  venue: string;
  year: string;
  doi: string;
  /** Shares a citation key with another entry — usually the same paper twice. */
  duplicate: boolean;
}

export const entryField = (entry: BibEntry, name: string): string =>
  entry.fields.find((f) => f.name === name)?.value ?? '';

export function summarise(entry: BibEntry, duplicates: Set<string>): PublicationSummary {
  return {
    id: entry.id,
    key: entry.key,
    type: entry.type,
    title: entryField(entry, 'title'),
    author: entryField(entry, 'author'),
    venue:
      entryField(entry, 'journal') ||
      entryField(entry, 'booktitle') ||
      entryField(entry, 'publisher'),
    year: entryField(entry, 'year'),
    doi: entryField(entry, 'doi'),
    duplicate: duplicates.has(entry.id),
  };
}

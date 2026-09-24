import type { Metadata } from 'next';

import { readPublicationsForEdit } from '@/lib/content';
import { duplicateKeys, splitEntries } from '@/lib/bibtex-entries';
import { summarise } from '@/lib/publications-admin';
import PublicationsEditor from './PublicationsEditor';

export const metadata: Metadata = { title: 'Publications' };
export const dynamic = 'force-dynamic';

export default async function AdminPublicationsPage() {
  const entries = splitEntries(await readPublicationsForEdit());
  const duplicates = duplicateKeys(entries);

  return <PublicationsEditor initial={entries.map((entry) => summarise(entry, duplicates))} />;
}

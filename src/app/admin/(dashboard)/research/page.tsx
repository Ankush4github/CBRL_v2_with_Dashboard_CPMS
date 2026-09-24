import type { Metadata } from 'next';

import { readContentForEdit } from '@/lib/content';
import ResearchEditor from './ResearchEditor';

export const metadata: Metadata = { title: 'Research areas' };
export const dynamic = 'force-dynamic';

export default async function AdminResearchPage() {
  return <ResearchEditor initial={await readContentForEdit('research')} />;
}

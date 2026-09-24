import type { Metadata } from 'next';

import { readContentForEdit } from '@/lib/content';
import MembersEditor from './MembersEditor';

export const metadata: Metadata = { title: 'Members' };
export const dynamic = 'force-dynamic';

export default async function AdminMembersPage() {
  return <MembersEditor initial={await readContentForEdit('members')} />;
}

import type { Metadata } from 'next';

import { getProjects } from '@/lib/content';
import ProjectsEditor from './ProjectsEditor';

export const metadata: Metadata = { title: 'Projects' };
export const dynamic = 'force-dynamic';

export default async function AdminProjectsPage() {
  return <ProjectsEditor initial={await getProjects()} />;
}

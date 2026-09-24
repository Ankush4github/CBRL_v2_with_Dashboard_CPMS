import type { Metadata } from 'next';

import { getMetricsForEdit } from '@/lib/content';
import MetricsEditor from './MetricsEditor';

export const metadata: Metadata = { title: 'Citation metrics' };
export const dynamic = 'force-dynamic';

export default async function AdminMetricsPage() {
  const metrics = (await getMetricsForEdit()) ?? {
    totalCitations: '',
    hIndex: 0,
    source: { name: 'Google Scholar', url: '' },
    lastUpdated: new Date().toISOString().slice(0, 10),
  };

  return <MetricsEditor initial={metrics} />;
}

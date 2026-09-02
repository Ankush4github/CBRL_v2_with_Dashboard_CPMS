import type { Metadata } from 'next';

import { getHome } from '@/lib/content';
import HomeEditor from './HomeEditor';

export const metadata: Metadata = { title: 'Home page' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  return <HomeEditor initial={await getHome()} />;
}

import type { Metadata } from 'next';

import { getGallery } from '@/lib/content';
import GalleryEditor from './GalleryEditor';

export const metadata: Metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

export default async function AdminGalleryPage() {
  return <GalleryEditor initial={await getGallery()} />;
}

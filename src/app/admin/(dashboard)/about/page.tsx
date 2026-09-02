import type { Metadata } from 'next';

import { getAbout, readPublicationsFile } from '@/lib/content';
import { splitEntries } from '@/lib/bibtex-entries';
import AboutEditor from './AboutEditor';

export const metadata: Metadata = { title: 'About the PI' };
export const dynamic = 'force-dynamic';

export default async function AdminAboutPage() {
  const [about, bibtex] = await Promise.all([getAbout(), readPublicationsFile()]);

  // Shown beside the `{publications}` hint so an editor can see what the token
  // will render as without opening the public page.
  const publications = splitEntries(bibtex).length;

  return <AboutEditor initial={about} publications={publications} />;
}

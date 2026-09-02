import type { Metadata } from 'next';

import { getAllMembers, getFacilities } from '@/lib/content';
import FacilitiesEditor from './FacilitiesEditor';

export const metadata: Metadata = { title: 'Facilities' };
export const dynamic = 'force-dynamic';

export default async function AdminFacilitiesPage() {
  const [facilities, members] = await Promise.all([getFacilities(), getAllMembers()]);

  // Offered as in-charge choices so the contact details and the /members#anchor
  // stay in step with the members section.
  const people = members.map((member) => ({
    id: member.id,
    name: member.name,
    title: member.title,
    email: member.email,
  }));

  return <FacilitiesEditor initial={facilities} people={people} />;
}

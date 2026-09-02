import { getFacilities } from '@/lib/content';
import FacilitiesClient from './FacilitiesClient';
import { metadata } from './metadata';

export { metadata };

export default async function Facilities() {
  const facilities = await getFacilities();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cbrl.iitkgp.ac.in/"},{"@type":"ListItem","position":2,"name":"Research Facilities","item":"https://cbrl.iitkgp.ac.in/facilities"}]}' }} />
      <FacilitiesClient {...facilities} />
    </>
  );
}

// JSON-LD for the members page. The member records themselves live in
// site_content (edited from the dashboard) and are read through @/lib/content;
// this module only turns them into structured data.
//
// Each Person is built by personSchema() in @/lib/member-profile, with the
// same @id and url its own profile page uses, so the list and the profile
// describe one person rather than two.

import type { MemberGroup, MembersContent } from '@/lib/content-types';
import { MEMBER_GROUPS } from '@/lib/content-types';
import { personSchema } from '@/lib/member-profile';
import { SITE_URL } from '@/lib/site-url';
import { HOME_URL, organizationRef, websiteRef } from '@/lib/site-identity';

export function generateMembersJsonLd(members: MembersContent) {
    const people = MEMBER_GROUPS.flatMap((group: MemberGroup) =>
        (members[group] ?? []).map((member) => ({ member, group }))
    );

    return [
        {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': `${SITE_URL}/members`,
            name: 'Team Members | Clinical Biomarker Research Laboratory (CBRL), IIT Kharagpur',
            description: 'Meet the faculty, research scientists, PhD scholars, technical staff, and alumni of the Clinical Biomarker Research Laboratory (CBRL) at IIT Kharagpur, led by Professor Koel Chaudhury.',
            url: `${SITE_URL}/members`,
            // References to the one WebSite and Organization defined in the
            // (site) layout, rather than copies with slightly different names.
            isPartOf: websiteRef,
            about: organizationRef,
            mainEntity: {
                '@type': 'ItemList',
                name: 'CBRL Team Members',
                numberOfItems: people.length,
                itemListElement: people.map((located, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    item: personSchema(located),
                })),
            },
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: HOME_URL },
                { '@type': 'ListItem', position: 2, name: 'Team Members', item: `${SITE_URL}/members` },
            ],
        },
    ];
}

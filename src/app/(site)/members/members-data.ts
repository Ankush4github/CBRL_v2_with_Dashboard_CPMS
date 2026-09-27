// JSON-LD for the members page. The member records themselves now live in
// content/members.json and are read through @/lib/content, so the dashboard can
// edit them; this module only turns them into structured data.

import type { Member, MembersContent } from '@/lib/content-types';
import { SITE_URL, absoluteAsset } from '@/lib/site-url';
import { PARENT_ORGANIZATION, organizationRef, websiteRef } from '@/lib/site-identity';

/**
 * Generate comprehensive JSON-LD structured data for all members.
 * This helps search engines index every member's name, image, and role.
 */
export function generateMembersJsonLd(members: MembersContent) {
    let position = 0;

    const createPersonItem = (m: Member, role: string) => {
        position++;
        const person: Record<string, unknown> = {
            '@type': 'Person',
            name: m.name.trim(),
            jobTitle: m.title,
            // The lab by @id rather than a copy per person: these used to name
            // it "Clinical Biomarker Research Laboratory (CBRL)" and "...,
            // IIT Kharagpur", dozens of near-duplicate organizations on one
            // page competing with the site-wide definition.
            affiliation: PARENT_ORGANIZATION,
            worksFor: organizationRef
        };

        if (m.image && !m.image.includes('empty_dp')) {
            person.image = {
                '@type': 'ImageObject',
                url: absoluteAsset(m.image),
                caption: `${m.name.trim()} - ${m.title} at CBRL, IIT Kharagpur`
            };
        }

        if (m.email) {
            person.email = m.email.split(',')[0].trim();
        }

        if (m.bio && m.bio !== 'Loading...') {
            person.description = m.bio;
        }

        if (m.research && m.research.trim()) {
            person.knowsAbout = m.research.trim();
        }

        if (m.qualifications) {
            const quals = m.qualifications.split('\n\n').map(q => q.split(': ')[0]).filter(Boolean);
            if (quals.length > 0) {
                person.hasCredential = quals.map(q => ({
                    '@type': 'EducationalOccupationalCredential',
                    credentialCategory: q
                }));
            }
        }

        if (m.profiles) {
            const sameAs: string[] = [];
            Object.values(m.profiles).forEach(url => {
                if (url && !url.includes('YOUR_ID') && !url.includes('YOUR_PROFILE')) {
                    sameAs.push(url);
                }
            });
            if (sameAs.length > 0) {
                person.sameAs = sameAs;
            }
        }

        person.memberOf = organizationRef;

        (person as Record<string, unknown>)['@id'] = `${SITE_URL}/members#${m.id}`;

        return {
            '@type': 'ListItem',
            position,
            item: person
        };
    };

    const allMembers = [
        ...members.faculty.map(m => createPersonItem(m, 'Faculty')),
        ...members.postdocs.map(m => createPersonItem(m, 'Postdoctoral Fellow')),
        ...members.students.map(m => createPersonItem(m, 'Research Scholar')),
        ...members.staff.map(m => createPersonItem(m, 'Staff')),
        ...members.alumni.map(m => createPersonItem(m, 'Alumni'))
    ];

    return [
        // Main Organization + Member List schema
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
                numberOfItems: allMembers.length,
                itemListElement: allMembers
            }
        },
        // BreadcrumbList for navigation
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                {
                    '@type': 'ListItem',
                    position: 1,
                    name: 'Home',
                    item: SITE_URL
                },
                {
                    '@type': 'ListItem',
                    position: 2,
                    name: 'Team Members',
                    item: `${SITE_URL}/members`
                }
            ]
        }
    ];
}

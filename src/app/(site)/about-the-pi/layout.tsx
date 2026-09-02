import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'About Prof. Koel Chaudhury',
    description: 'Prof. Koel Chaudhury, Principal Investigator at CBRL, IIT Kharagpur. Biomarker discovery in women\'s health and respiratory disease, with 180+ publications.',
    alternates: {
        canonical: 'https://cbrl.iitkgp.ac.in/about-the-pi',
    },
    robots: {
        index: true,
        follow: true,
        nocache: false,
        googleBot: {
            index: true,
            follow: true,
            noimageindex: false,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
    openGraph: {
        title: 'Prof. Koel Chaudhury | Leading Biomarker Research at IIT Kharagpur',
        description: 'Professor Koel Chaudhury, Principal Investigator at CBRL, IIT Kharagpur. Pioneering research in women\'s health, respiratory disorders, and precision diagnostics. 200+ publications, 23 PhDs guided, multiple awards and patents.',
        url: 'https://cbrl.iitkgp.ac.in/about-the-pi',
        type: 'profile',
        locale: 'en_US',
        siteName: 'Clinical Biomarker Research Laboratory - CBRL',
        images: [
            {
                url: '/images/og/pi.jpg',
                width: 1200,
                height: 630,
                alt: 'Prof. Koel Chaudhury - Principal Investigator, CBRL, IIT Kharagpur',
                type: 'image/jpeg'
            },
            {
                url: '/images/og/cbrl.jpg',
                width: 1200,
                height: 630,
                alt: 'CBRL Laboratory - Advanced Biomarker Research Facility',
                type: 'image/jpeg'
            },
            {
                url: '/cbrl-logo.png',
                width: 1440,
                height: 1440,
                alt: 'Clinical Biomarker Research Laboratory Logo',
                type: 'image/png'
            }
        ]
    },
    twitter: {
        card: 'summary_large_image',
        site: '@CBRLofficial',
        creator: '@CBRLofficial',
        title: 'Prof. Koel Chaudhury | Biomarker Research Excellence',
        description: 'Leading research in women\'s health, respiratory disorders, and precision medicine at IIT Kharagpur. 200+ publications, 23 PhDs guided.',
        images: {
            url: '/images/og/pi.jpg',
            alt: 'Prof. Koel Chaudhury - CBRL Principal Investigator'
        }
    },
    other: {
        'profile:first_name': 'Koel',
        'profile:last_name': 'Chaudhury',
        'profile:username': 'Prof. Koel Chaudhury',
        'article:author': 'Prof. Koel Chaudhury',
        'contact:email': 'koel@smst.iitkgp.ac.in',
        'contact:phone': '+91 3222 283572',
        'og:locality': 'Kharagpur',
        'og:region': 'West Bengal',
        'og:country-name': 'India',
        'research:areas': 'Women\'s Health, Respiratory Disorders, Metabolomics, Proteomics, Biomarker Discovery, Precision Medicine',
        'academic:institution': 'Indian Institute of Technology Kharagpur',
        'academic:department': 'School of Medical Science and Technology',
        'academic:position': 'Professor and Principal Investigator'
    }
};

export default function AboutPILayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
    <>
      {/* Breadcrumbs only. The Person record for this page is built in
          page.tsx from the `about` content, so that a portrait or phone
          number edited in the dashboard cannot be contradicted by a second,
          hardcoded copy of the same entity here. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cbrl.iitkgp.ac.in/"},{"@type":"ListItem","position":2,"name":"About the PI","item":"https://cbrl.iitkgp.ac.in/about-the-pi"}]}' }} />
      {children}
    </>
  );
}

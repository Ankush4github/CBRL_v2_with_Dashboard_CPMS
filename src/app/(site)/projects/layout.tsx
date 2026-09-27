import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Research Projects',
    description:
        "CBRL research projects at IIT Kharagpur: silicosis screening, PCOS gut microbiome, lung disease biomarkers and pregnancy loss. Funded by ICMR, DBT and SERB.",
    alternates: {
        canonical: 'https://cbrl.iitkgp.ac.in/projects'
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
        title: 'Research Projects | Clinical Biomarker Research Laboratory',
        description:
            "Discover CBRL's ongoing multi-omics research projects in women's health, respiratory disorders, and innovative diagnostics. Our work spans silicosis biomarkers, PCOS microbiome, lung disease differentiation, COPD-cancer prediction, and reproductive health.",
        url: 'https://cbrl.iitkgp.ac.in/projects',
        type: 'website',
        locale: 'en_US',
        siteName: 'Clinical Biomarker Research Laboratory',
        images: [
            {
                url: '/images/og/cbrl.jpg',
                width: 1200,
                height: 630,
                alt: 'CBRL Research Laboratory Equipment',
                type: 'image/jpeg'
            }
        ]
    },
    twitter: {
        card: 'summary_large_image',
        site: '@CBRLofficial',
        creator: '@CBRLofficial',
        title: 'Research Projects | CBRL',
        description:
            "Multi-omics research projects in women's health, respiratory disorders, and innovative diagnostics. Advancing biomarker discovery through metabolomics, transcriptomics, and microbiome profiling.",
        images: {
            url: '/images/og/cbrl.jpg',
            alt: 'CBRL Research Projects'
        }
    },
    other: {
        'research:funding': 'ICMR, DBT, SERB, DHR',
        'research:institution': 'Indian Institute of Technology Kharagpur',
        'research:department': 'School of Medical Science and Technology',
        'research:areas': 'Women\'s Health, Respiratory Disorders, Multi-omics, Biomarker Discovery',
        'research:pi': 'Prof. Koel Chaudhury'
    }
};

export default function ProjectsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cbrl.iitkgp.ac.in/"},{"@type":"ListItem","position":2,"name":"Research Projects","item":"https://cbrl.iitkgp.ac.in/projects"}]}' }} />
      {children}
    </>
  );
}

import type { Metadata } from 'next';
import { jsonLd } from '@/lib/json-ld';
import { getMembers } from '@/lib/content';
import { generateMembersJsonLd } from './members-data';

export const metadata: Metadata = {
  title: 'Team Members',
  description: 'Meet the CBRL research team at IIT Kharagpur led by Prof. Koel Chaudhury: faculty, postdocs, PhD scholars and staff in multi-omics biomarker research.',
  alternates: {
    canonical: 'https://cbrl.iitkgp.ac.in/members',
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
    title: 'Team Members | Clinical Biomarker Research Laboratory',
    description: 'Meet our research team led by Prof. Koel Chaudhury: research scientists, PhD scholars, and technical staff specializing in multi-omics biomarker discovery for lung diseases, women\'s reproductive health, and innovative diagnostics at IIT Kharagpur.',
    url: 'https://cbrl.iitkgp.ac.in/members',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clinical Biomarker Research Laboratory',
    images: [
      {
        url: '/images/og/pi.jpg',
        width: 1200,
        height: 630,
        alt: 'CBRL Research Team led by Prof. Koel Chaudhury, IIT Kharagpur',
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
    title: 'Team Members | CBRL',
    description: 'Research team led by Prof. Koel Chaudhury specializing in multi-omics biomarker discovery for lung diseases, women\'s health, and innovative diagnostics.',
    images: {
      url: '/images/og/pi.jpg',
      alt: 'CBRL Research Team - Prof. Koel Chaudhury and members'
    }
  },
  other: {
    'organization:name': 'Clinical Biomarker Research Laboratory',
    'organization:pi': 'Prof. Koel Chaudhury',
    'organization:institution': 'Indian Institute of Technology Kharagpur',
    'organization:department': 'School of Medical Science and Technology',
    'team:expertise': 'Metabolomics, Proteomics, Biomarker Discovery, Multi-omics Research'
  }
};

export default async function MembersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLdSchemas = generateMembersJsonLd(await getMembers());

  return (
    <>
      {/* Server-rendered JSON-LD for all members - crawlable by search engines */}
      {jsonLdSchemas.map((schema, index) => (
        <script
          key={`jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
        />
      ))}
      {children}
    </>
  );
}
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Publications',
  description: 'Browse 180+ peer-reviewed papers and book chapters from Prof. Koel Chaudhury and CBRL, IIT Kharagpur, spanning metabolomics, proteomics and diagnostics.',
  alternates: {
    canonical: 'https://cbrl.iitkgp.ac.in/publications',
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
    title: 'Publications | CBRL Research Papers & Scientific Articles',
    description: 'Explore 180+ peer-reviewed research publications and scientific contributions to biomarker research and clinical diagnostics from CBRL, IIT Kharagpur.',
    url: 'https://cbrl.iitkgp.ac.in/publications',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clinical Biomarker Research Laboratory',
    images: [
      {
        url: '/images/og/cbrl.jpg',
        width: 1200,
        height: 630,
        alt: 'CBRL Research Publications - Scientific Articles and Papers',
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
    title: 'Publications | CBRL Research Papers',
    description: 'Explore 180+ peer-reviewed research publications and scientific contributions to biomarker research.',
    images: {
      url: '/images/og/cbrl.jpg',
      alt: 'CBRL Research Publications'
    }
  },
  other: {
    'citation_author': 'Prof. Koel Chaudhury',
    'citation_author_institution': 'Indian Institute of Technology Kharagpur',
    'publication:type': 'Journal Articles, Book Chapters, Conference Papers',
    'publication:topics': 'Biomarker Discovery, Metabolomics, Proteomics, Clinical Diagnostics',
    'scholar:profile': 'https://scholar.google.com/citations?user=qafn3S0AAAAJ'
  }
};

export default function PublicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"CollectionPage","name":"CBRL Publications","description":"Browse 180+ peer-reviewed research publications from Clinical Biomarker Research Laboratory at IIT Kharagpur.","url":"https://cbrl.iitkgp.ac.in/publications","isPartOf":{"@id":"https://cbrl.iitkgp.ac.in/#website"},"about":{"@type":"Thing","name":"Biomarker Research Publications"},"author":{"@type":"Person","name":"Prof. Koel Chaudhury"}}' }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cbrl.iitkgp.ac.in/"},{"@type":"ListItem","position":2,"name":"Publications","item":"https://cbrl.iitkgp.ac.in/publications"}]}' }} />
      {children}
    </>
  );
}
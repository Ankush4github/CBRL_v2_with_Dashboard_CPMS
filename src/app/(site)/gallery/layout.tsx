import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Photos from CBRL at IIT Kharagpur: international conferences, awards and convocations, lab outings and team moments in biomarker research.',
  alternates: {
    canonical: 'https://cbrl.iitkgp.ac.in/gallery',
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
    title: 'Gallery | Clinical Biomarker Research Laboratory',
    description: 'Photo gallery showcasing CBRL\'s journey: international conferences (Metabolomics 2024 Japan, APT 2025, IEEE conferences, Pulmocon 2025), awards, convocations, and team moments at IIT Kharagpur.',
    url: 'https://cbrl.iitkgp.ac.in/gallery',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clinical Biomarker Research Laboratory - CBRL',
    images: [
      // Conferences
      {
        url: '/images/og/gallery-metabolomics.jpg',
        width: 1200,
        height: 630,
        alt: 'CBRL Team at Metabolomics 2024 Conference, Japan',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/gallery-apt.jpg',
        width: 1200,
        height: 630,
        alt: 'APT 2025 Conference at IIT Bombay - Best Poster Award',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/gallery-ieee-embc.jpg',
        width: 1200,
        height: 630,
        alt: 'IEEE EMBC 2025 Conference, Copenhagen Denmark',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/gallery-pulmocon.jpg',
        width: 1200,
        height: 630,
        alt: 'Pulmocon 2025 IPCR Kolkata - Poster Presentation Awards',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/gallery-ieee-upwiecon.jpg',
        width: 1200,
        height: 630,
        alt: 'IEEE UPWIECON 2025 Conference, NIELIT Dehradun',
        type: 'image/jpeg'
      },
      // Awards
      {
        url: '/images/og/gallery-convocation.jpg',
        width: 1200,
        height: 630,
        alt: 'IIT Kharagpur 70th Convocation - PhD Graduation',
        type: 'image/jpeg'
      },
      // Lab Outings
      {
        url: '/images/og/gallery-sankarpur.jpg',
        width: 1200,
        height: 630,
        alt: 'CBRL Lab Team Outing at Sankarpur Beach',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/gallery-lab-picnic.jpg',
        width: 1200,
        height: 630,
        alt: 'Lab Picnic at Professor\'s Garden',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/gallery-coffee-pe-charcha.jpg',
        width: 1200,
        height: 630,
        alt: 'Coffee pe Charcha - Lab Bonding Sessions',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/gallery-lab-celebrations.jpg',
        width: 1200,
        height: 630,
        alt: 'Lab Celebrations - Team Events and Achievements',
        type: 'image/jpeg'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CBRLofficial',
    creator: '@CBRLofficial',
    title: 'Gallery | CBRL',
    description: 'Moments from conferences, awards, and team events. Capturing our journey in biomarker research at IIT Kharagpur.',
    images: {
      url: '/images/og/gallery-metabolomics.jpg',
      alt: 'CBRL Laboratory Gallery'
    }
  },
  other: {
    'gallery:type': 'Photo Gallery',
    'gallery:categories': 'Conferences, Awards, Lab Outings, Celebrations',
    'gallery:organization': 'Clinical Biomarker Research Laboratory',
    'gallery:location': 'IIT Kharagpur, West Bengal, India'
  }
};

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"CollectionPage","name":"CBRL Photo Gallery","description":"Photo gallery of the Clinical Biomarker Research Laboratory at IIT Kharagpur featuring conferences, awards, and team events.","url":"https://cbrl.iitkgp.ac.in/gallery","isPartOf":{"@type":"WebSite","name":"Clinical Biomarker Research Laboratory","url":"https://cbrl.iitkgp.ac.in"}}' }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cbrl.iitkgp.ac.in/"},{"@type":"ListItem","position":2,"name":"Gallery","item":"https://cbrl.iitkgp.ac.in/gallery"}]}' }} />
      {children}
    </>
  );
}
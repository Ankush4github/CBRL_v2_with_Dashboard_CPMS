import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Research Facilities',
  description: "Explore CBRL's laboratory instrumentation at IIT Kharagpur, including Waters Xevo G3 QTof mass spectrometry, HPLC, FTIR and atomic force microscopy.",
  alternates: {
    canonical: 'https://cbrl.iitkgp.ac.in/facilities',
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
    title: 'Research Facilities | Advanced Laboratory Equipment at CBRL',
    description: 'Discover our cutting-edge laboratory equipment and advanced technologies that power biomarker research and clinical diagnostics at CBRL, IIT Kharagpur.',
    url: 'https://cbrl.iitkgp.ac.in/facilities',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clinical Biomarker Research Laboratory - CBRL',
    images: [
      {
        url: '/images/og/cbrl.jpg',
        width: 1200,
        height: 630,
        alt: 'Waters Mass Spectrometry Equipment at CBRL Laboratory',
        type: 'image/jpeg'
      },
      {
        url: '/images/og/facilities-hplc.jpg',
        width: 1200,
        height: 630,
        alt: 'HPLC Chromatography System at CBRL',
        type: 'image/jpeg'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CBRLofficial',
    creator: '@CBRLofficial',
    title: 'Research Facilities | CBRL Laboratory Equipment',
    description: 'Explore our advanced laboratory equipment and cutting-edge technologies for biomarker research at IIT Kharagpur.',
    images: {
      url: '/images/og/cbrl.jpg',
      alt: 'CBRL Laboratory Facilities'
    }
  },
  other: {
    'geo.region': 'IN-WB',
    'geo.placename': 'IIT Kharagpur',
    'geo.position': '22.3149;87.3105',
    'facility:type': 'Research Laboratory',
    'facility:institution': 'Indian Institute of Technology Kharagpur',
    'facility:department': 'School of Medical Science and Technology',
    'equipment:specialty': 'Mass Spectrometry, HPLC, FTIR, AFM, NMR'
  }
};
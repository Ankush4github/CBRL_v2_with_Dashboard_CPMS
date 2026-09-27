import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Contact CBRL at IIT Kharagpur — Room 329-330, Life Science Building. Email contact.cbrl@smst.iitkgp.ac.in or call +91 03222 282221.',
  alternates: {
    canonical: 'https://cbrl.iitkgp.ac.in/contact',
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
    title: 'Contact CBRL | Life Science Building, IIT Kharagpur',
    description: 'Contact Clinical Biomarker Research Laboratory at Room 329-330, Life Science Building, IIT Kharagpur. Email: contact.cbrl@smst.iitkgp.ac.in | Phone: +91 03222 282221. Research collaborations and inquiries welcome.',
    url: 'https://cbrl.iitkgp.ac.in/contact',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clinical Biomarker Research Laboratory',
    images: [
      {
        url: '/images/og/contact.jpg',
        width: 1200,
        height: 630,
        alt: 'Clinical Biomarker Research Laboratory at IIT Kharagpur',
        type: 'image/jpeg'
      },
      {
        url: '/cbrl-logo.png',
        width: 1440,
        height: 1440,
        alt: 'CBRL Logo',
        type: 'image/png'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CBRLofficial',
    creator: '@CBRLofficial',
    title: 'Contact CBRL | IIT Kharagpur',
    description: 'Clinical Biomarker Research Laboratory, Life Science Building, IIT Kharagpur. Email: contact.cbrl@smst.iitkgp.ac.in | Phone: +91 03222 282221',
    images: {
      url: '/images/og/contact.jpg',
      alt: 'Life Science Building, IIT Kharagpur'
    }
  },
  other: {
    'contact:email': 'contact.cbrl@smst.iitkgp.ac.in',
    'contact:email:pi': 'koel@smst.iitkgp.ac.in',
    'contact:phone': '+91 03222 282221',
    'contact:address': 'Room 329-330, 3rd Floor, Life Science Building, School of Medical Science and Technology, IIT Kharagpur, Kharagpur-721302, West Bengal, India',
    'geo:position': '22.3149;87.3105',
    'geo:placename': 'Life Science Building, IIT Kharagpur'
  }
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"ContactPage","name":"Contact CBRL","description":"Contact the Clinical Biomarker Research Laboratory at IIT Kharagpur.","url":"https://cbrl.iitkgp.ac.in/contact","mainEntity":{"@type":"Organization","@id":"https://cbrl.iitkgp.ac.in/#organization","name":"Clinical Biomarker Research Laboratory","telephone":"+91-3222-282221","email":"contact.cbrl@smst.iitkgp.ac.in","address":{"@type":"PostalAddress","streetAddress":"Room 329-330, 3rd Floor, Life Science Building, School of Medical Science and Technology","addressLocality":"Kharagpur","addressRegion":"West Bengal","postalCode":"721302","addressCountry":"IN"}}}' }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cbrl.iitkgp.ac.in/"},{"@type":"ListItem","position":2,"name":"Contact Us","item":"https://cbrl.iitkgp.ac.in/contact"}]}' }} />
      {children}
    </>
  );
}
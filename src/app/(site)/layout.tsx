import Script from 'next/script'
import Navigation from '@/components/Navigation'
import SiteFooter from '@/components/SiteFooter'
import { jsonLd } from '@/lib/json-ld'

/**
 * Chrome for the public site: navigation, footer, analytics and the site-wide
 * structured data. The dashboard sits outside this group so it renders none of
 * it â€” see src/app/(admin).
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // JSON-LD objects
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': ['ResearchOrganization', 'EducationalOrganization'],
    name: 'Clinical Biomarker Research Laboratory',
    alternateName: 'CBRL',
    url: 'https://cbrl.iitkgp.ac.in',
    logo: {
      '@type': 'ImageObject',
      url: 'https://cbrl.iitkgp.ac.in/cbrl-logo.png',
    },
    image: 'https://cbrl.iitkgp.ac.in/images/facilities/waters-ms.jpg',
    description: "Clinical Biomarker Research Laboratory at IIT Kharagpur, led by Prof. Koel Chaudhury. Omics-driven biomarker discovery and insights into disease pathogenesis of complex etiology.",
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'School of Medical Science and Technology, Life Science Building, Room 329-330, 3rd Floor',
      addressLocality: 'Kharagpur',
      addressRegion: 'West Bengal',
      postalCode: '721302',
      addressCountry: 'IN',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 22.3149,
      longitude: 87.3105,
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        telephone: '+91-3222-282221',
        email: 'contact.cbrl@smst.iitkgp.ac.in',
        areaServed: 'IN',
        availableLanguage: ['en'],
      },
    ],
    // sameAs must list other URLs for this same entity, so the lab's LinkedIn
    // belongs here and the PI's Scholar profile belongs on `founder` below.
    sameAs: [
      'https://www.linkedin.com/company/clinical-biomarkers-research-laboratory',
    ],
    parentOrganization: {
      '@type': 'CollegeOrUniversity',
      name: 'Indian Institute of Technology Kharagpur',
      url: 'https://www.iitkgp.ac.in/',
      sameAs: 'https://en.wikipedia.org/wiki/IIT_Kharagpur',
    },
    knowsAbout: [
      'Biomarker Research', 'Clinical Diagnostics', 'Metabolomics',
      'Proteomics', "Women's Health", 'Respiratory Disorders',
      'Mass Spectrometry', 'Translational Medicine'
    ],
    founder: {
      '@type': 'Person',
      name: 'Prof. Koel Chaudhury',
      url: 'https://cbrl.iitkgp.ac.in/about-the-pi',
      jobTitle: 'Professor and Principal Investigator',
      sameAs: ['https://scholar.google.com/citations?user=qafn3S0AAAAJ'],
    },
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Clinical Biomarker Research Laboratory',
    alternateName: 'CBRL',
    url: 'https://cbrl.iitkgp.ac.in',
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://cbrl.iitkgp.ac.in/publications?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Clinical Biomarker Research Laboratory',
      url: 'https://cbrl.iitkgp.ac.in',
    },
  }

  return (
    <>
      {/* Inter is self-hosted by next/font, so no Google Fonts origin is ever
          contacted â€” analytics is the only third party left to warm up. The
          dashboard loads no analytics, so this stays on the public side. */}
      <link rel="dns-prefetch" href="https://www.googletagmanager.com" />

      {/* Google tag (gtag.js). lazyOnload rather than afterInteractive:
          afterInteractive emits a <link rel="preload"> that competes with the
          LCP image for bandwidth on mobile. The trade is that a bounce inside
          the first second or so may go unrecorded. */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-87168HV39E"
        strategy="lazyOnload"
      />
      <Script id="google-analytics" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-87168HV39E');
        `}
      </Script>

      {/* JSON-LD: Organization */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(orgJsonLd) }}
      />
      {/* JSON-LD: WebSite */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd) }}
      />

      <Navigation />
      <main id="main-content" className="flex-grow bg-background text-foreground transition-colors duration-300 pt-24">
        {children}
      </main>

      <SiteFooter />
    </>
  )
}

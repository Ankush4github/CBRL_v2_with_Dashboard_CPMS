import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Script from 'next/script'
import ServiceWorkerManager from '@/components/ServiceWorkerManager'
import { ThemeProvider } from '@/context/ThemeContext'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true
})

export const metadata: Metadata = {
  metadataBase: new URL('https://cbrl.iitkgp.ac.in'),
  manifest: '/manifest.json',
  // Keep the template short: page titles must stay under ~60 characters once
  // it is appended, or search results truncate them.
  title: {
    template: '%s | CBRL, IIT Kharagpur',
    default: 'Clinical Biomarker Research Laboratory | IIT Kharagpur',
  },
  // Kept under ~155 characters: Google truncates the result snippet past that,
  // and the cut used to fall mid-list.
  description:
    "CBRL at IIT Kharagpur: omics-driven biomarker discovery in women's and respiratory health using metabolomics, proteomics and mass spectrometry.",
  authors: [
    { name: 'CBRL Team', url: 'https://cbrl.iitkgp.ac.in' },
    { name: 'Prof. Koel Chaudhury', url: 'https://cbrl.iitkgp.ac.in/members' }
  ],
  creator: 'Clinical Biomarker Research Laboratory, IIT Kharagpur',
  publisher: 'CBRL Team',
  category: 'Medical Research',
  classification: 'Research Laboratory',
  alternates: {
    // Single-language site: hreflang alternates pointing every locale at the
    // same URL carry no signal, so only the canonical is declared.
    canonical: './',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://cbrl.iitkgp.ac.in/',
    siteName: 'Clinical Biomarker Research Laboratory',
    // The same as the <title> default and the WebSite name, so every signal
    // agrees on the site's identity (see src/lib/site-identity.ts).
    title: 'Clinical Biomarker Research Laboratory | IIT Kharagpur',
    description:
      "Clinical Biomarker Research Laboratory at IIT Kharagpur, led by Prof. Koel Chaudhury. Omics-driven biomarker discovery and insights into disease pathogenesis of complex etiology. Specializing in women's health, respiratory disorders, and innovative diagnostics through multi-omics research.",
    images: [
      {
        url: '/images/og/cbrl.jpg',
        width: 1200,
        height: 630,
        alt: 'State-of-the-art biomarker research equipment at CBRL - Mass Spectrometry Laboratory',
        type: 'image/jpeg'
      },
      {
        url: '/cbrl-logo.png',
        width: 1440,
        height: 1440,
        alt: 'Clinical Biomarker Research Laboratory Logo',
        type: 'image/png'
      }
    ],
    ttl: 604800
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CBRLofficial',
    creator: '@CBRLofficial',
    title: 'Clinical Biomarker Research Laboratory | IIT Kharagpur',
    description: 'Omics-driven biomarker discovery and disease pathogenesis research. Leading multi-omics laboratory advancing women\'s health, respiratory disorders, and innovative diagnostics.',
    images: {
      url: '/images/og/cbrl.jpg',
      alt: 'CBRL Advanced Research Equipment'
    }
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
  verification: {
    google: 'zj8eSVkT3X1KAH7QWQpdOcCe_nKM-p7_VJql3PTOHtM',
    // yandex: 'paste-your-yandex-verification-code-here',
    // bing: 'paste-your-bing-verification-code-here'
  },
  other: {
    'theme-color': '#2563eb',
    'color-scheme': 'light dark',
    'format-detection': 'telephone=yes, email=yes, address=yes',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'msapplication-TileColor': '#2563eb',
    'application-name': 'CBRL',
    'apple-mobile-web-app-title': 'CBRL',
    // Gone, deliberately:
    //   msapplication-config -- pointed at /browserconfig.xml, which does not
    //     exist (the server answers 403).
    //   referrer -- a <meta name="referrer"> overrides the Referrer-Policy
    //     header, and this one (origin-when-cross-origin) was looser than the
    //     header's strict-origin-when-cross-origin in next.config.js.
    //   rating, distribution, revisit-after, language -- read by no search
    //     engine; the page language is <html lang="en">.
    'geo.region': 'IN-WB',
    'geo.placename': 'Kharagpur',
    'geo.position': '22.3149;87.3105',
    'ICBM': '22.3149, 87.3105'
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
    // The 192px and 512px Android icons belong in manifest.json, not here:
    // "android-chrome-192x192" is not a link relation browsers recognise.
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        {/* Theme initialization script - must run before content renders */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body
        className={`${inter.className} transition-colors duration-300 bg-background text-foreground min-h-screen flex flex-col`}
        suppressHydrationWarning={true}
      >
        <ThemeProvider>
          <ServiceWorkerManager />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}

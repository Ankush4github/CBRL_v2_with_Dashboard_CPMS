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
  description:
    "Clinical Biomarker Research Laboratory at IIT Kharagpur, led by Prof. Koel Chaudhury. Omics-driven biomarker discovery in women's and respiratory health.",
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
    siteName: 'Clinical Biomarker Research Laboratory - CBRL',
    title: 'Clinical Biomarker Research Laboratory | IIT Kharagpur - Advanced Biomarker Research',
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
    'msapplication-config': '/browserconfig.xml',
    'application-name': 'CBRL',
    'apple-mobile-web-app-title': 'CBRL',
    'referrer': 'origin-when-cross-origin',
    'rating': 'general',
    'distribution': 'global',
    'revisit-after': '7 days',
    'language': 'English',
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
    other: [
      {
        rel: 'android-chrome-192x192',
        url: '/android-chrome-192x192.png',
      },
      {
        rel: 'android-chrome-512x512',
        url: '/android-chrome-512x512.png',
      },
    ],
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

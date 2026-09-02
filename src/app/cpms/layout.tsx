import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import { AppProviders } from "@/components/cpms/AppProviders";
import { asset } from "@/lib/cpms/base-path";

/**
 * Self-hosted out of /_next/static/media by next/font, the same way the site
 * loads Inter. These were three @import url(fonts.googleapis.com) lines at the
 * top of the CPMS stylesheet — render-blocking, and they forced two Google
 * origins into this app's CSP. Both are now gone from it.
 *
 * Lora was the third import, mapped to `font-serif`. Nothing in the app uses
 * that utility, so it is not carried over.
 *
 * Exposed as CSS variables rather than applied by className: the wrapper below
 * needs `data-app` for the token scope anyway, and variables let the scoped
 * `font-mono` override in globals.css reach Space Mono without a second class.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-cpms-sans",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-cpms-mono",
});

// CPMS lives at /cpms on the main CBRL host rather than its own domain. Next
// does not run metadata URLs through a route prefix, so the icon paths below go
// through asset() and the absolute URLs are spelled out against this base.
const SITE_URL = "https://cbrl.iitkgp.ac.in";

// Ported from the Vite index.html <head>. Next's Metadata API replaces the raw
// tags; the rendered output is equivalent.
export const metadata: Metadata = {
  // `absolute` because the root layout sets a title template — without it this
  // renders as "CPMS - … | CBRL, IIT Kharagpur", which is the site's identity
  // stapled onto a different application.
  title: { absolute: "CPMS - CBRL Patient Management System" },
  description:
    "Secure, AI-powered prescription scanning and patient record management for healthcare professionals. CBRL Patient Management System.",
  keywords: [
    "CPMS",
    "CBRL",
    "patient management",
    "healthcare",
    "prescription scanning",
    "AI",
    "OCR",
    "medical records",
    "hospital management",
  ],
  authors: [{ name: "CBRL Healthcare" }],
  icons: { icon: asset("/favicon.png"), apple: asset("/favicon.png") },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CPMS",
  },
  openGraph: {
    title: "CPMS - CBRL Patient Management System",
    description:
      "Secure prescription scanning and patient record management for healthcare professionals.",
    type: "website",
    url: `${SITE_URL}${asset("/")}`,
    images: [`${SITE_URL}${asset("/cbrl-logo.png")}`],
  },
  twitter: {
    card: "summary_large_image",
    site: "@CBRLHealthcare",
    images: [`${SITE_URL}${asset("/cbrl-logo.png")}`],
  },
};

// themeColor and viewport-fit live in the separate `viewport` export in modern
// Next; putting them in `metadata` is deprecated and warns at build time.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d9488",
};

/**
 * A nested layout, not a root one. The site's layout at src/app/layout.tsx owns
 * <html> and <body> for the whole app now; emitting them again here nested a
 * second document inside the first, which browsers silently discard but which
 * is invalid markup and a hydration hazard.
 *
 * `data-app="cpms"` is what scopes this application's design tokens. Both apps
 * name their tokens identically (--background, --primary, …) but give them
 * different values, so globals.css redefines the whole set on this element.
 * Custom properties resolve to the nearest ancestor that declares them, so
 * everything inside gets CPMS's palette regardless of the `dark` class the
 * site's theme toggle puts on <html> — which is what keeps CPMS light-only.
 */
export default function CpmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-app="cpms"
      className={`${spaceGrotesk.variable} ${spaceMono.variable} min-h-screen bg-background text-foreground`}
    >
      <AppProviders>{children}</AppProviders>
    </div>
  );
}

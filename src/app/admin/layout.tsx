import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | CBRL Dashboard',
    default: 'CBRL Dashboard',
  },
  // The dashboard must never appear in search results, and crawlers should not
  // follow links out of it either.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

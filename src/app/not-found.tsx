import Link from 'next/link';
import { Home, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Navigation from '@/components/Navigation';
import SiteFooter from '@/components/SiteFooter';
// Import our custom ErrorMicroscope component
import ErrorMicroscope from '@/components/ErrorMicroscope';

/**
 * The 404 page for every unmatched URL.
 *
 * It has to live here at the root rather than in `(site)`: Next only routes an
 * unmatched URL to `app/not-found.tsx`, and a `not-found.tsx` inside a route
 * group is never reached for one. `notFound()` also renders its boundary
 * without the intermediate layouts, so `(site)/layout.tsx` contributes nothing
 * either way — hence the explicit chrome here.
 */
export default function NotFound() {
  return (
    <>
      <Navigation />
      <main
        id="main-content"
        className="flex flex-grow flex-col items-center justify-center px-4 pt-24 pb-16 sm:px-6 lg:px-8"
      >
        <div className="w-full max-w-xl text-center">
          {/* Microscope SVG Icon */}
          <div className="relative mx-auto h-28 w-28 text-primary">
            <ErrorMicroscope className="h-full w-full" />
          </div>

          {/* 404 Error Text */}
          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Error 404
          </p>
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Specimen Not Found
          </h1>

          <div className="mx-auto mt-8 max-w-md border-t pt-6">
            <p className="text-muted-foreground">
              The page you&#39;re looking for appears to be missing<br />
              from our laboratory database.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to Home
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg">
              <Link href="/facilities">
                <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
                View Our Facilities
              </Link>
            </Button>
          </div>

          {/* Support Link */}
          <div className="mt-10 text-sm">
            <p className="text-muted-foreground">
              Need assistance?{' '}
              <Link
                href="/contact"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Contact our support team
              </Link>
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ChevronDown, Mail, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { RESTRICTED_IP_HEADER } from '@/lib/admin-network';
import RetryButton from './RetryButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Network access restricted',
};

/** The lab's public contact address, as given in the site footer. */
const ADMIN_EMAIL = 'contact.cbrl@smst.iitkgp.ac.in';

/**
 * Shown in place of any dashboard page requested from outside the network
 * allowlist (ADMIN_ALLOWED_IPS).
 *
 * This page decides nothing. The proxy (src/proxy.ts) has already refused the
 * request and rewritten it here with a 403, passing the address it saw in a
 * request header; the browser keeps the URL it asked for, so "Try again" is a
 * plain reload that puts the same request back through the same check. The
 * allowlist itself never leaves the server.
 *
 * Reached any other way -- typed in from an allowed network -- the header is
 * absent (the proxy strips it from every request it lets through), and there
 * is nothing to explain, so it goes to the dashboard.
 */
export default async function NetworkRestricted() {
  const requestHeaders = await headers();
  const ip = requestHeaders.get(RESTRICTED_IP_HEADER);
  if (ip === null) redirect('/admin');

  const mailto =
    `mailto:${ADMIN_EMAIL}` +
    `?subject=${encodeURIComponent('CBRL dashboard: network access')}` +
    `&body=${encodeURIComponent(
      `Hello,\n\nI cannot open the CBRL content dashboard from my network.\n\nNetwork IP: ${ip}\n`
    )}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* The institutional line, as on the sign-in page. */}
      <header className="flex h-9 shrink-0 items-center bg-primary text-primary-foreground">
        <div className="mx-auto w-full max-w-[1400px] truncate px-5 text-[11px] font-medium tracking-[0.01em] min-[560px]:px-8">
          Indian Institute of Technology Kharagpur
          <span> &middot; School of Medical Science and Technology</span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="w-full max-w-[540px]">
          <div className="mb-6 flex items-center gap-3">
            <Image
              src="/cbrl-logo.png"
              alt=""
              width={40}
              height={40}
              quality={60}
              className="h-10 w-10 shrink-0 object-contain"
            />
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              Content dashboard
            </p>
          </div>

          <section
            aria-labelledby="restricted-title"
            className="rounded-xl border bg-card p-6 shadow-[0_20px_50px_rgba(17,24,39,0.08)] sm:rounded-2xl sm:p-10"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </span>

            <h1
              id="restricted-title"
              className="mt-5 text-2xl font-bold leading-tight tracking-[-0.02em] sm:text-[28px]"
            >
              Network Access Restricted
            </h1>

            <p className="mt-3 text-[15px] font-medium leading-relaxed text-foreground">
              This dashboard is not available from your current network.
            </p>
            <p className="mt-2 text-sm leading-[1.7] text-muted-foreground">
              For security reasons, access to this dashboard is limited to authorized networks.
              Please connect through an approved institutional network or contact the
              administrator if you believe this is an error.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <RetryButton />
              <Button asChild variant="outline" className="h-11 gap-2 sm:w-auto">
                <a href={mailto}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Contact Administrator
                </a>
              </Button>
            </div>

            {/* Native <details>: keyboard- and screen-reader-accessible, and
                works before any JavaScript has loaded. */}
            <details className="group mt-7 rounded-lg border bg-muted/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                Technical Details
                <ChevronDown
                  className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t px-4 py-3 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium text-foreground">Access Denied</dd>
                <dt className="text-muted-foreground">Network IP</dt>
                <dd>
                  <code className="break-all rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                    {ip}
                  </code>
                </dd>
              </dl>
            </details>
          </section>

          <Link
            href="/"
            className="mt-6 inline-block rounded text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4"
          >
            &larr; Back to the website
          </Link>
        </div>
      </main>
    </div>
  );
}

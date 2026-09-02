'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowRight, Clock, Loader2, ShieldX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/browser';

/** Google's mark, inlined so the button needs no network request to render. */
function GoogleMark() {
  return (
    <span className="rounded-full bg-white p-0.5">
      <svg viewBox="0 0 24 24" className="block h-[18px] w-[18px]" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.23 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
        />
      </svg>
    </span>
  );
}

/**
 * The drifting rings and dots behind both panels.
 *
 * Purely decorative, so each is `aria-hidden` and none can take pointer events.
 * Built from the primary token at low alpha rather than a fixed blue, so they
 * follow the theme like everything else, and each carries
 * `motion-reduce:animate-none` — the drift is atmosphere, and atmosphere is the
 * first thing to drop for someone who asked for less movement.
 */
function Orb({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute h-[150px] w-[150px] animate-float-slow rounded-full border border-primary/20 motion-reduce:animate-none ${className}`}
    >
      <span className="absolute inset-[22px] rounded-full border border-primary/[0.12]" />
      <span className="absolute inset-[48px] rounded-full border border-primary/[0.12]" />
    </span>
  );
}

function Ring({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute h-[82px] w-[82px] animate-float-medium rounded-full border border-primary/[0.15] motion-reduce:animate-none ${className}`}
    />
  );
}

function Dot({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute animate-float-dot rounded-full bg-primary motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * The sections the dashboard governs.
 *
 * Two lists read across, which is why the order runs left-to-right within each
 * row rather than down each column — the vertical hairline between them is what
 * says so. Kept in step with the route folders under src/app/admin/(dashboard).
 */
const SECTIONS = [
  'Home page',
  'Members',
  'Research',
  'Projects',
  'Publications',
  'Facilities',
  'Gallery',
  'Citation metrics',
];

/**
 * One banner shape for every thing that can be said on arrival or after a
 * failed attempt, so the four cases cannot drift apart visually.
 *
 * `tone` also decides how it is announced. The two reasons carried in the URL
 * are already on the page when it loads, so they are `status` — a live region
 * that does not interrupt. A sign-in that fails in front of the user is an
 * `alert`, because it appears in response to something they just did and they
 * need to hear it without moving focus.
 */
function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'error';
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  const isError = tone === 'error';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={
        isError
          ? 'flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px] leading-relaxed text-destructive'
          : 'flex items-start gap-2.5 rounded-lg border bg-muted/50 p-3 text-[13px] leading-relaxed text-muted-foreground'
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export default function LoginForm({ configured }: { configured: boolean }) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reason = searchParams.get('reason');
  // Set by whichever noticed first — the idle timer in the dashboard, or the
  // proxy turning away a request on a session that had already lapsed.
  const timedOut = reason === 'timeout';
  // Signed in to Supabase, but the account holds no site_editors grant.
  const denied = reason === 'denied';
  const failed = reason === 'failed';

  async function handleSignIn() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const next = searchParams.get('next');
    const callback = new URL('/admin/auth/callback', window.location.origin);
    // Carried through Google and back, so an editor who was deep-linked to a
    // particular editor page lands there rather than on the dashboard root.
    if (next && next.startsWith('/admin')) callback.searchParams.set('next', next);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    });

    if (oauthError) {
      setError(oauthError.message || 'Could not start sign-in.');
      setBusy(false);
    }
    // On success the browser is navigating to Google; leave `busy` set so the
    // button cannot be pressed twice while that is in flight.
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* The institutional line, full width above the split. */}
      <header className="flex h-9 shrink-0 items-center bg-primary text-primary-foreground">
        <div className="mx-auto w-full max-w-[1400px] truncate px-5 text-[11px] font-medium tracking-[0.01em] min-[560px]:px-8">
          Indian Institute of Technology Kharagpur
          <span> &middot; School of Medical Science and Technology</span>
        </div>
      </header>

      <main className="grid flex-1 min-[900px]:grid-cols-[minmax(360px,0.9fr)_minmax(460px,1.1fr)]">
        {/* ── Identity ────────────────────────────────────────────────── */}
        <aside className="relative flex justify-center overflow-hidden border-b bg-card px-5 py-10 min-[560px]:px-8 min-[560px]:py-[52px] min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:px-16 min-[900px]:py-[72px]">
          {/*
            The large faint circle bleeding off the right edge. Wide layout only:
            once the columns stack there is no panel edge for it to bleed past.
            The drifting set below it stays at every width.
          */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-[150px] top-[15%] hidden h-[260px] w-[260px] rounded-full border opacity-70 min-[900px]:block"
          />
          <Orb className="right-[7%] top-[8%]" />
          <Ring className="bottom-[12%] left-[8%]" />
          <Dot className="left-[10%] top-[27%] h-[5px] w-[5px] opacity-25 [animation-delay:-2s]" />

          <div className="relative z-[1] flex w-full max-w-[520px] flex-col">
            <div className="mb-10 flex items-center gap-3.5 min-[900px]:mb-[54px]">
              <Image
                src="/cbrl-logo.png"
                // Empty on purpose: the label beside it already names this, so
                // announcing "CBRL logo" as well would only repeat it.
                alt=""
                width={54}
                height={54}
                quality={60}
                className="h-[54px] w-[54px] shrink-0 object-contain"
              />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                Content dashboard
              </p>
            </div>

            <h1 className="max-w-[510px] text-[32px] font-bold leading-[1.08] tracking-[-0.04em] min-[900px]:text-[clamp(32px,3.2vw,48px)]">
              Clinical Biomarker Research Laboratory
            </h1>

            <p className="mt-[22px] max-w-[500px] text-sm leading-[1.8] text-muted-foreground min-[560px]:text-[15px]">
              Where the laboratory&rsquo;s public website is written and kept current — its
              pages, its people, its publications and its images.
            </p>

            <section className="mt-[52px]" aria-labelledby="sections-title">
              <p
                id="sections-title"
                className="mb-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
              >
                Eight sections
              </p>
              <ul className="grid border-t min-[560px]:grid-cols-2">
                {SECTIONS.map((section, i) => (
                  <li
                    key={section}
                    className={`flex min-h-12 items-center border-b text-[13px] text-muted-foreground transition-colors hover:text-foreground ${
                      // The hairline between the two lists, and the breathing
                      // room either side of it. Both collapse with the grid on
                      // the narrow layout, where there is only one column.
                      i % 2 === 0
                        ? 'min-[560px]:border-r min-[560px]:pr-[18px]'
                        : 'min-[560px]:pl-[18px]'
                    }`}
                  >
                    {section}
                  </li>
                ))}
              </ul>
            </section>

            {/* Wide layout only; the narrow one carries this under the card. */}
            <Link
              href="/"
              className="group mt-auto hidden w-fit rounded pt-14 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 min-[900px]:block"
            >
              Back to the website
              <ArrowRight
                className="ml-1.5 inline h-3 w-3 transition-transform group-hover:translate-x-[3px] motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          </div>
        </aside>

        {/* ── Action ──────────────────────────────────────────────────── */}
        <section className="relative flex items-center justify-center overflow-hidden bg-background px-5 py-10 min-[560px]:px-8 min-[560px]:py-[52px] min-[900px]:px-16 min-[900px]:py-[72px]">
          <Orb className="right-[7%] top-[8%]" />
          <Dot className="bottom-[20%] right-[14%] h-[7px] w-[7px] opacity-35" />

          <div className="relative z-[1] w-full max-w-[470px]">
            <div className="rounded-xl border bg-card px-[22px] py-[30px] shadow-[0_20px_50px_rgba(17,24,39,0.08)] min-[560px]:rounded-2xl min-[560px]:p-11">
              <h2 className="text-[27px] font-bold leading-[1.15] tracking-[-0.03em] min-[560px]:text-[30px]">
                Sign in
              </h2>

              {configured ? (
                <>
                  <p className="mt-3 text-sm leading-[1.7] text-muted-foreground">
                    Use the Google account that has been granted editor access.
                  </p>

                  {/*
                    All four messages in one stack, in the order they matter:
                    why you are back at this screen, then what went wrong trying
                    to leave it.
                  */}
                  {(timedOut || denied || error || failed) && (
                    <div className="mt-5 space-y-3">
                      {timedOut && (
                        <Notice tone="info" icon={Clock}>
                          You were signed out after a period of inactivity. Sign in again to
                          continue.
                        </Notice>
                      )}
                      {denied && (
                        <Notice tone="error" icon={ShieldX}>
                          That account is not a website editor. Ask an administrator to grant
                          it access, then sign in again.
                        </Notice>
                      )}
                      {(error || failed) && (
                        <Notice tone="error" icon={AlertTriangle}>
                          {error ?? 'Sign-in did not complete. Please try again.'}
                        </Notice>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleSignIn}
                    disabled={busy}
                    aria-busy={busy}
                    className="mt-[30px] h-[50px] w-full gap-[11px] rounded-lg text-sm font-semibold shadow-[0_8px_18px_hsl(var(--primary)/0.15)] transition-[transform,box-shadow,background-color] hover:-translate-y-px hover:shadow-[0_12px_24px_hsl(var(--primary)/0.2)] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Redirecting to Google&hellip;
                      </>
                    ) : (
                      <>
                        <GoogleMark />
                        Continue with Google
                      </>
                    )}
                  </Button>

                  <p className="mt-[26px] border-t pt-[22px] text-[11px] leading-[1.7] text-muted-foreground">
                    Editor access is granted per account. Sessions end automatically after a
                    period of inactivity.
                  </p>
                </>
              ) : (
                /*
                  Only reachable before the environment is filled in, so this is
                  addressed to whoever is setting the dashboard up rather than to
                  an editor. The values are placeholders, not live configuration.
                */
                <div className="mt-5 space-y-3">
                  <Notice tone="error" icon={AlertTriangle}>
                    The dashboard is not configured yet.
                  </Notice>
                  <p className="text-sm leading-[1.7] text-muted-foreground">
                    Add these to <code className="font-mono text-xs">.env.local</code> and
                    restart the server:
                  </p>
                  <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-[11px] leading-relaxed">
{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
ADMIN_SESSION_SECRET=at-least-16-random-characters`}
                  </pre>
                </div>
              )}
            </div>

            <Link
              href="/"
              className="mt-[22px] inline-block rounded text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4 min-[900px]:hidden"
            >
              &larr; Back to the website
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

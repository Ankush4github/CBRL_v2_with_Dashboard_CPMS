import type { ReactNode } from 'react';

/**
 * Editorial page header used at the top of every interior page.
 *
 * Keeps the eyebrow / h1 / lead trio in an identical position on all pages:
 * flush with the container's left edge, py-16 sm:py-20 inside a full-bleed
 * band closed by a hairline rule.
 */
export default function PageHeader({
  eyebrow,
  title,
  tagline,
  lead,
}: {
  eyebrow: string;
  title: string;
  /** Optional short statement rendered between the title and the lead. */
  tagline?: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <section className="border-b">
      <div className="container mx-auto px-4 sm:px-6">
        <header className="py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {tagline && (
            <p className="mt-5 max-w-2xl text-lg font-light text-foreground sm:text-xl">
              {tagline}
            </p>
          )}
          {lead && (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {lead}
            </p>
          )}
        </header>
      </div>
    </section>
  );
}

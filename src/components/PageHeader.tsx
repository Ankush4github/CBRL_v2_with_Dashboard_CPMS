import type { ReactNode } from 'react';

/**
 * Editorial page header used at the top of every interior page.
 *
 * Keeps the eyebrow / h1 / lead trio in an identical position on all pages:
 * flush with the container's left edge, py-16 sm:py-20 inside a full-bleed
 * band closed by a hairline rule. `aside` takes the right-hand column on
 * large screens (a stat strip, a small visual) and stacks under the text on
 * mobile. `actions` sits under the lead (buttons, jump links).
 */
export default function PageHeader({
  eyebrow,
  title,
  tagline,
  lead,
  actions,
  aside,
}: {
  eyebrow: string;
  title: string;
  /** Optional short statement rendered between the title and the lead. */
  tagline?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="border-b">
      <div className="container mx-auto px-4 sm:px-6">
        <div
          className={
            aside
              ? 'grid items-end gap-8 py-16 sm:py-20 lg:grid-cols-12'
              : 'py-16 sm:py-20'
          }
        >
          <header className={aside ? 'lg:col-span-7' : undefined}>
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
            {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
          </header>
          {aside && <div className="lg:col-span-5">{aside}</div>}
        </div>
      </div>
    </section>
  );
}

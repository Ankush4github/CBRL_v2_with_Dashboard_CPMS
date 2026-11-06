import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The eyebrow / heading / intro block every homepage and interior section
 * opens with. `action` sits opposite the heading on wide screens (a "View
 * all" link) and drops underneath it on narrow ones.
 */
export default function SectionHeading({
  eyebrow,
  title,
  intro,
  action,
  id,
  align = 'left',
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  action?: ReactNode;
  /** id for the h2, so the section can be aria-labelledby it. */
  id?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 md:flex-row md:items-end md:justify-between',
        align === 'center' && 'items-center text-center md:flex-col md:items-center',
        className
      )}
    >
      <div className={cn('max-w-3xl', align === 'center' && 'mx-auto')}>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="display-2 mt-3 text-balance">
          {title}
        </h2>
        {intro && <p className="lead mt-3 max-w-2xl">{intro}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

'use client';

import { Button } from '@/components/ui/button';

/**
 * Shown inside the dashboard shell when a section cannot be loaded.
 *
 * The usual cause is the database read failing: the editors deliberately
 * refuse to open on the committed copy from disk, because saving it would
 * overwrite everything edited since that commit (see ContentUnavailableError
 * in lib/content). In production the thrown message is redacted, so this says
 * what matters without it.
 */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">This section could not be loaded</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The content could not be read from the database, so the editor was not opened —
        editing an out-of-date copy would overwrite recent changes. Nothing has been changed.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

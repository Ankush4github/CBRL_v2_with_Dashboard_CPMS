'use client';

import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Asks again. The browser is still on the URL it originally requested (the
 * proxy rewrote the response, not the address), so a reload sends that same
 * request back through the server's network check. Nothing is decided here.
 */
export default function RetryButton() {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      className="h-11 gap-2 sm:w-auto"
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        setBusy(true);
        window.location.reload();
      }}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      )}
      Try Again
    </Button>
  );
}

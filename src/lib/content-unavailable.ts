import { NextResponse } from 'next/server';

import { ContentUnavailableError } from './content';

/**
 * `.catch()` handler for the *ForEdit readers in a route handler: a database
 * read failure becomes a 503 the dashboard can show, and anything else is
 * rethrown. Callers check `instanceof NextResponse` and return it.
 *
 * A 503 rather than falling back is the point — a write built on the disk copy
 * would overwrite the live document (see ContentUnavailableError).
 */
export function contentUnavailable(error: unknown): NextResponse {
  if (error instanceof ContentUnavailableError) {
    return NextResponse.json(
      { error: error.message },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } }
    );
  }
  throw error;
}

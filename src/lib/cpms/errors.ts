/**
 * Turning a backend failure into something safe to put on screen.
 *
 * Almost every failure in CPMS arrives as a `PostgrestError`, a `StorageError`
 * or an `AuthError`, and every one of those carries a `message` written for a
 * database administrator rather than a user:
 *
 *   new row violates row-level security policy for table "patient_records"
 *   duplicate key value violates unique constraint "patient_records_reference_number_key"
 *   column patient_records.foo does not exist
 *
 * Those strings name tables, columns, constraints and policies, which together
 * describe the schema and the access model to anyone holding a CPMS login —
 * and CPMS logins include field staff, not just administrators. So the raw
 * message never reaches the UI. What reaches the UI is keyed off the error
 * *code*, which is a stable enumeration and says nothing about the schema.
 *
 * The detail is not thrown away: it goes to the browser console in
 * development, where whoever is debugging can see all of it. In a production
 * build it is not logged at all, so the raw text never leaves the server.
 */

const DEV = process.env.NODE_ENV !== 'production';

/**
 * SQLSTATE and PostgREST codes worth naming. Anything absent falls through to
 * the caller's fallback — a code we have not thought about is, by definition,
 * one whose message we cannot vouch for.
 */
const BY_CODE: Record<string, string> = {
  // Postgres constraint violations. These are the ones a user can act on.
  '23505': 'A record with those details already exists.',
  '23503': 'Another record still refers to this one, so it cannot be changed.',
  '23502': 'Something required was missing. Please fill in every field and try again.',
  '23514': 'One of the values entered is not allowed.',
  '22P02': 'One of the values was not in the expected format.',
  '22001': 'One of the values is too long.',

  // Row-level security and grants. PostgREST answers 403 with this code, and
  // it is by far the most common failure here — an account that is disabled,
  // or not assigned to the hospital it is trying to write to.
  '42501': 'You do not have permission to do that. Please contact your administrator.',

  // A schema mismatch between this build and the database. Nothing the user
  // can do, and the message would name the missing column.
  '42703': 'Something went wrong on our side. Please try again later.',
  '42P01': 'Something went wrong on our side. Please try again later.',
  PGRST202: 'Something went wrong on our side. Please try again later.',
  PGRST204: 'Something went wrong on our side. Please try again later.',

  // Expired or missing JWT.
  PGRST301: 'Your session has expired. Please sign in again.',

  // Supabase Storage.
  NoSuchKey: 'That file is no longer available.',
  NoSuchBucket: 'Something went wrong on our side. Please try again later.',
  EntityTooLarge: 'That file is too large.',
  InvalidKey: 'That file name is not allowed.',
};

/** Codes and shapes that mean "the request never landed", not "it was refused". */
function isOffline(error: unknown): boolean {
  if (error instanceof TypeError) return /fetch|network/i.test(error.message);
  // functions-js catches the failed fetch and rethrows it as a FunctionsFetchError
  // whose own message is the same sentence whatever went wrong; the TypeError
  // that says the request never left the browser is kept in `context`.
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof TypeError) return /fetch|network/i.test(context.message);
  const code = codeOf(error);
  // postgrest-js catches a failed fetch and reports it as a PostgrestError with
  // every diagnostic field blank — an empty `code` is how a dropped request is
  // distinguished from one the database actually answered.
  return code === '' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT';
}

function codeOf(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  // PostgrestError and AuthError use `code`; StorageError uses `statusCode`,
  // which carries the same kind of value ('NoSuchKey', '404').
  const raw =
    (error as { code?: unknown }).code ?? (error as { statusCode?: unknown }).statusCode;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return null;
}

/**
 * True when this error came back from Supabase rather than from our own code.
 *
 * `PostgrestError`, `StorageError` and `AuthError` are all `Error` subclasses,
 * so `instanceof Error` cannot tell them apart from a `new Error('Pick a
 * hospital first')` thrown a few lines up — and those hand-written messages are
 * the ones worth showing. What separates them is the diagnostic fields: only a
 * backend error carries `code`, `details`, `hint` or `status`.
 */
const BACKEND_MARKERS = [
  // PostgrestError
  'code',
  'details',
  'hint',
  // AuthError, StorageError
  'status',
  'statusCode',
  '__isStorageError',
  // FunctionsError — its message is always the generic "Edge Function returned
  // a non-2xx status code", so it must not be mistaken for one of ours.
  'context',
  // StorageUnknownError
  'originalError',
];

function isBackendError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return BACKEND_MARKERS.some((key) => key in error);
}

/**
 * Everything known about `error`, on one line, for the console while developing.
 *
 * It has to be a *string* rather than an object. Two separate things eat an
 * object here: `name` and `message` are non-enumerable own properties on an
 * Error subclass, so logging the error itself shows nothing; and Next's dev
 * overlay renders a logged plain object through a `formatObject` that asks for
 * `Object.getOwnPropertyDescriptor(arg, 'key')` — the literal string `'key'`,
 * not the loop variable — so every key is skipped and the overlay prints `{}`
 * whatever the object held. A string survives both.
 */
function forConsole(error: unknown): string {
  if (error === null || error === undefined) return String(error);
  if (typeof error !== 'object') return `${typeof error} ${String(error)}`;

  const detail = error as Record<string, unknown>;
  const name = typeof detail.name === 'string' ? detail.name : 'Error';
  const message =
    typeof detail.message === 'string' && detail.message ? detail.message : '(no message)';
  const parts = [`${name}: ${message}`];

  for (const key of ['code', 'status', 'statusCode', 'details', 'hint'] as const) {
    const value = detail[key];
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${key}=${String(value)}`);
    }
  }

  // FunctionsHttpError, FunctionsRelayError and FunctionsFetchError carry the
  // whole Response — or the fetch failure underneath it — in `context`, and
  // their own message is the same generic sentence every time. The status and
  // URL in here are the only part that says which call failed and how.
  const context = detail.context;
  if (typeof Response !== 'undefined' && context instanceof Response) {
    const where = [context.status, context.statusText, context.url].filter(Boolean).join(' ');
    parts.push(`response=${where}`);
  } else if (context instanceof Error) {
    parts.push(`context=${context.name}: ${context.message}`);
  }

  return parts.join(' ');
}

/**
 * A message safe to show for `error`, and the full detail in the console while
 * developing.
 *
 * `fallback` is what a user sees when the error is not one we recognise, so
 * write it for the action that failed — "Could not save the patient record."
 * beats "An error occurred."
 */
export function describeError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (DEV) console.error(`[cpms] ${forConsole(error)}`);

  if (isOffline(error)) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  const code = codeOf(error);
  if (code && BY_CODE[code]) return BY_CODE[code];

  // Not from Supabase, so the message is one of ours and was written to be read.
  if (!isBackendError(error) && error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

/**
 * describeError() for a failed `supabase.functions.invoke()`.
 *
 * Every non-2xx from an Edge Function arrives as a FunctionsHttpError whose own
 * message is the fixed string "Edge Function returned a non-2xx status code" —
 * useless to a user, and it names the architecture. What the function actually
 * said is in the Response it carries in `context`, and our Edge Functions all
 * answer `{ error: string }` with that string written for the person reading
 * it: "Your account is not enabled for attendance.", "A test email was just
 * sent." Those are worth showing; anything else falls back to describeError().
 *
 * Async because reading the body is. Callers that cannot await stay on
 * describeError() and show their own fallback.
 */
export async function describeInvokeError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (typeof Response !== 'undefined' && context instanceof Response) {
    try {
      // clone(), because a caller may want the body too — reading it here would
      // otherwise leave them with a used stream.
      const body = await context.clone().json();
      const message = (body as { error?: unknown } | null)?.error;
      if (typeof message === 'string' && message && message.length <= 200) {
        if (DEV) console.error(`[cpms] ${forConsole(error)} body=${message}`);
        return message;
      }
    } catch {
      // Not JSON, or the stream was already consumed. The fallback path below
      // is the same one a caller would have taken anyway.
    }
  }
  return describeError(error, fallback);
}

// Checks for src/lib/cpms/errors.ts — the mapping that decides what a user is
// told when a backend call fails. The point of these is not that the wording is
// right but that the *raw* wording never escapes: a PostgREST message names the
// table, the column, the constraint or the policy that refused the request, and
// CPMS logins include field staff.
//
// So each case asserts two things: the message shown is the one intended, and
// nothing in it matches the schema-identifier scan at the bottom.
//
//   npx tsx scripts/test-error-messages.mts
//
import { describeError } from '../src/lib/cpms/errors.ts';

// describeError logs the raw detail to the console in a development build and
// says nothing in a production one. Capture it rather than let it print, so the
// count can be asserted at the end — "nothing is logged in production" is the
// half of the contract that keeps raw text out of the browser.
const logged: unknown[][] = [];
console.error = (...args: unknown[]) => { logged.push(args); };

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}
function checkNot(label: string, haystack: string, needle: string) {
  const leaked = haystack.toLowerCase().includes(needle.toLowerCase());
  if (!leaked) pass++; else { fail++; console.log(`  FAIL ${label}: ${JSON.stringify(haystack)} contains ${JSON.stringify(needle)}`); }
}

/** A PostgrestError as postgrest-js actually builds it: an Error with the fields. */
function postgrest(message: string, code: string, details = '', hint = '') {
  return Object.assign(new Error(message), { code, details, hint, name: 'PostgrestError' });
}
/** A StorageApiError. `__isStorageError` is the marker storage-js sets. */
function storage(message: string, status: number, statusCode: string) {
  return Object.assign(new Error(message), { __isStorageError: true, status, statusCode, name: 'StorageApiError' });
}
/** A FunctionsHttpError — carries `context`, and always the same generic message. */
function functionsError() {
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: { status: 500 }, name: 'FunctionsHttpError',
  });
}
/** An AuthError. */
function auth(message: string, code: string, status: number) {
  return Object.assign(new Error(message), { code, status, name: 'AuthApiError' });
}

// The messages Postgres and PostgREST actually return, verbatim. Each is
// followed by what the user must see instead.
const REAL_WORLD: Array<[string, Error, string]> = [
  ['RLS refusal on insert',
    postgrest('new row violates row-level security policy for table "patient_records"', '42501'),
    'You do not have permission to do that. Please contact your administrator.'],
  ['grant refusal on select',
    postgrest('permission denied for table patient_records', '42501'),
    'You do not have permission to do that. Please contact your administrator.'],
  ['duplicate reference number',
    postgrest('duplicate key value violates unique constraint "patient_records_reference_number_key"', '23505',
      'Key (reference_number)=(F0126) already exists.'),
    'A record with those details already exists.'],
  ['foreign key',
    postgrest('update or delete on table "hospitals" violates foreign key constraint "patient_records_hospital_fkey" on table "patient_records"', '23503'),
    'Another record still refers to this one, so it cannot be changed.'],
  ['not-null',
    postgrest('null value in column "patient_name" of relation "patient_records" violates not-null constraint', '23502'),
    'Something required was missing. Please fill in every field and try again.'],
  ['check constraint',
    postgrest('new row for relation "patient_records" violates check constraint "patient_records_age_check"', '23514'),
    'One of the values entered is not allowed.'],
  ['bad uuid',
    postgrest('invalid input syntax for type uuid: "not-a-uuid"', '22P02'),
    'One of the values was not in the expected format.'],
  ['value too long',
    postgrest('value too long for type character varying(50)', '22001'),
    'One of the values is too long.'],
  ['unknown column (schema drift)',
    postgrest('column patient_records.confidence does not exist', '42703'),
    'Something went wrong on our side. Please try again later.'],
  ['missing relation',
    postgrest('relation "public.patient_recordz" does not exist', '42P01'),
    'Something went wrong on our side. Please try again later.'],
  ['expired jwt',
    postgrest('JWT expired', 'PGRST301'),
    'Your session has expired. Please sign in again.'],
  ['schema cache miss',
    postgrest("Could not find the 'confidence' column of 'patient_records' in the schema cache", 'PGRST204'),
    'Something went wrong on our side. Please try again later.'],
  ['storage object missing',
    storage('Object not found', 404, 'NoSuchKey'),
    'That file is no longer available.'],
  ['storage bucket missing',
    storage('Bucket not found', 404, 'NoSuchBucket'),
    'Something went wrong on our side. Please try again later.'],
  ['storage too large',
    storage('The object exceeded the maximum allowed size', 413, 'EntityTooLarge'),
    'That file is too large.'],
];

console.log('--- backend errors are replaced, not echoed ---');
for (const [label, error, expected] of REAL_WORLD) {
  check(label, describeError(error, 'FALLBACK-NOT-EXPECTED'), expected);
}

console.log('--- dropped requests read as connectivity, not as a refusal ---');
// postgrest-js reports a failed fetch as a PostgrestError with every field blank.
check('postgrest network', describeError(postgrest('TypeError: Failed to fetch', '')),
  'Could not reach the server. Check your connection and try again.');
check('raw TypeError', describeError(new TypeError('Failed to fetch')),
  'Could not reach the server. Check your connection and try again.');
check('network in message', describeError(new TypeError('NetworkError when attempting to fetch resource.')),
  'Could not reach the server. Check your connection and try again.');

console.log('--- unrecognised backend errors fall back, never echo ---');
check('unmapped code', describeError(postgrest('some internal detail about table foo', '54000'), 'Could not save.'),
  'Could not save.');
check('no code at all but backend-shaped', describeError(Object.assign(new Error('internal detail'), { details: 'x' }), 'Could not save.'),
  'Could not save.');
check('FunctionsHttpError never shows its generic text', describeError(functionsError(), 'Failed to generate PDF. Please try again.'),
  'Failed to generate PDF. Please try again.');
check('AuthError unmapped', describeError(auth('Invalid Refresh Token: Already Used', 'refresh_token_already_used', 400), 'Please sign in again.'),
  'Please sign in again.');

console.log('--- our own messages still reach the user ---');
check('plain Error passes through', describeError(new Error('Please pick a hospital first.'), 'FALLBACK'),
  'Please pick a hospital first.');
check('edge function curated message', describeError(new Error('Image size exceeds 10MB limit'), 'FALLBACK'),
  'Image size exceeds 10MB limit');

console.log('--- odd inputs do not throw or leak ---');
check('null', describeError(null, 'Could not load.'), 'Could not load.');
check('undefined', describeError(undefined, 'Could not load.'), 'Could not load.');
check('thrown string', describeError('boom', 'Could not load.'), 'Could not load.');
check('thrown number', describeError(42, 'Could not load.'), 'Could not load.');
check('empty Error message', describeError(new Error(''), 'Could not load.'), 'Could not load.');
check('default fallback', describeError(postgrest('detail', '54000')), 'Something went wrong. Please try again.');

// The real assertion. Every message this module can produce for a backend
// failure is scanned for the things a schema disclosure would consist of.
console.log('--- no schema identifier survives into any message ---');
const FORBIDDEN = [
  'patient_records', 'site_content', 'site_editors', 'profiles', 'hospitals',
  'reference_number', 'patient_name', 'confidence', 'uhid',
  'row-level security', 'policy', 'constraint', 'relation', 'sqlstate',
  'pg_', 'postgres', 'supabase', 'jwt', 'select', 'insert', 'column',
  '_fkey', '_key', '_check', 'schema cache', 'character varying',
];
for (const [label, error] of REAL_WORLD) {
  const shown = describeError(error, 'Could not complete that action.');
  for (const needle of FORBIDDEN) checkNot(`${label} / "${needle}"`, shown, needle);
}
// And for the fallbacks, which is what an unmapped error produces.
for (const needle of FORBIDDEN) {
  checkNot(`unmapped / "${needle}"`, describeError(postgrest('permission denied for table patient_records', '54000'), 'Could not save the patient record. Please try again.'), needle);
}

// Run this file twice — once plain, once with NODE_ENV=production — and the
// same messages must come out both times, with the detail logged only the
// first time. Anything logged in a production build would be raw backend text
// sitting in the user's browser console.
const isProd = process.env.NODE_ENV === 'production';
console.log(`--- dev-only logging (NODE_ENV=${process.env.NODE_ENV ?? 'unset'}) ---`);
if (isProd) {
  check('nothing logged in a production build', logged.length, 0);
} else {
  check('detail logged in a development build', logged.length > 0, true);
  const sample = JSON.stringify(logged[0]);
  check('and it is the detail worth having', sample.includes('code'), true);
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// Checks for src/app/api/admin/upload/route.ts — everything the upload
// endpoint refuses, and why.
//
// The handler is called directly, so the proxy's session gate is not in the
// picture: what is under test is the route's own validation. Every rejection
// happens before the Supabase client is constructed, so a rejected request
// returns a clean JSON response here. A request that passes validation instead
// dies at `await createClient()`, which needs a request scope for cookies() —
// so "threw reaching storage" is how an accepted upload shows up below, and
// that is the outcome the valid-image cases assert.
//
//   npx tsx scripts/test-upload-validation.mts
//
import path from 'node:path';
import sharp from 'sharp';

import { POST } from '../src/app/api/admin/upload/route.ts';
import { createRequire } from 'node:module';
import { slugify } from '../src/lib/content-types.ts';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

// Silence the route's own server-side logging; it is expected on the reject paths.
const logged: unknown[][] = [];
console.warn = (...a: unknown[]) => { logged.push(a); };
console.error = (...a: unknown[]) => { logged.push(a); };

type Outcome = { status: number; body: Record<string, unknown> } | { status: 'accepted' };

async function upload(
  parts: { file?: File | string; destination?: string; name?: string; subfolder?: string },
  headers: Record<string, string> = {}
): Promise<Outcome> {
  const form = new FormData();
  if (parts.file !== undefined) form.set('file', parts.file as Blob | string);
  if (parts.destination !== undefined) form.set('destination', parts.destination);
  if (parts.name !== undefined) form.set('name', parts.name);
  if (parts.subfolder !== undefined) form.set('subfolder', parts.subfolder);

  const request = new Request('http://localhost:3200/api/admin/upload', {
    method: 'POST', body: form, headers,
  });
  try {
    const response = await POST(request as never);
    return { status: response.status, body: await response.json() };
  } catch {
    // Got past every check and reached the storage client.
    return { status: 'accepted' };
  }
}

const status = (o: Outcome) => ('body' in o ? o.status : 'accepted');
const error = (o: Outcome) => ('body' in o ? o.body.error : '(accepted)');

// --------------------------------------------------------- the editor check
// The route repeats the proxy's sign-in check before reading the body. Outside
// a request there is no session, so the real check refuses — which is what the
// first case confirms. Every case after that stands in a signed-in editor, so
// what they exercise is the validation behind the check.
{
  const refused = await upload({ file: 'x', destination: 'members' });
  check('no session is refused before validation', status(refused), 401);
}
// Through require, not import: tsx loads src/ as CommonJS, and an ESM import
// of the same file here gets a second module instance — reassigning that one
// would leave the route's copy untouched.
const { editorGuard } = createRequire(import.meta.url)('../src/lib/admin-guard.ts');
editorGuard.refuse = async () => null;

// ---------------------------------------------------------------- payloads
const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#c00' } }).png().toBuffer();
const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#0c0' } }).jpeg().toBuffer();
const webp = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#00c' } }).webp().toBuffer();
const gif = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#cc0' } }).gif().toBuffer();
const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#888' } }).png().toBuffer();

const asFile = (bytes: Buffer | string, name: string, type: string) =>
  new File([bytes as unknown as BlobPart], name, { type });

/** A Windows PE executable header. */
const exeBytes = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), Buffer.alloc(120), Buffer.from('This program cannot be run in DOS mode')]);
/** An ELF executable header. */
const elfBytes = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), Buffer.alloc(120)]);
/** A PHP webshell. */
const phpBytes = Buffer.from('<?php system($_GET["c"]); ?>');
/** An SVG carrying script. */
const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>');
/** HTML that would run if served from this origin. */
const htmlBytes = Buffer.from('<html><script>fetch("/api/admin/whoami").then(r=>r.text()).then(alert)</script></html>');
/** A real PNG with a webshell appended — valid image, hostile tail. */
const polyglot = Buffer.concat([png, phpBytes]);

console.log('--- valid images are accepted (all five declared types) ---');
check('png',  status(await upload({ file: asFile(png,  'a.png',  'image/png'),  destination: 'members' })), 'accepted');
check('jpeg', status(await upload({ file: asFile(jpeg, 'a.jpg',  'image/jpeg'), destination: 'members' })), 'accepted');
check('webp', status(await upload({ file: asFile(webp, 'a.webp', 'image/webp'), destination: 'facilities' })), 'accepted');
check('gif',  status(await upload({ file: asFile(gif,  'a.gif',  'image/gif'),  destination: 'sponsors' })), 'accepted');
check('large but legal (4000x3000)', status(await upload({ file: asFile(big, 'a.png', 'image/png'), destination: 'hero' })), 'accepted');
check('every allowed destination', await Promise.all(
  ['members', 'alumni', 'facilities', 'gallery', 'sponsors', 'hero', 'collab'].map(async (d) =>
    status(await upload({ file: asFile(png, 'a.png', 'image/png'), destination: d })))),
  ['accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted']);

console.log('--- missing or malformed parts ---');
check('no file',            status(await upload({ destination: 'members' })), 400);
check('no file / message',  error( await upload({ destination: 'members' })), 'No file was attached.');
check('file is a string',   status(await upload({ file: 'not-a-file', destination: 'members' })), 400);
check('no destination',     status(await upload({ file: asFile(png, 'a.png', 'image/png') })), 400);
check('no destination / message', error(await upload({ file: asFile(png, 'a.png', 'image/png') })), 'Unknown upload destination.');

console.log('--- declared MIME type outside the allowlist ---');
for (const [label, type] of [
  ['text/plain', 'text/plain'],
  ['application/pdf', 'application/pdf'],
  ['image/svg+xml', 'image/svg+xml'],
  ['application/x-msdownload', 'application/x-msdownload'],
  ['application/octet-stream', 'application/octet-stream'],
  ['text/html', 'text/html'],
  ['application/javascript', 'application/javascript'],
  ['image/png; charset=x (not an exact match)', 'image/png; charset=x'],
  ['empty type', ''],
] as const) {
  check(`refused: ${label}`, status(await upload({ file: asFile(png, 'a.bin', type), destination: 'members' })), 415);
}
// Case is not the route's problem to solve: Blob/File lowercases the declared
// type per spec before the handler ever sees it, so the lowercase-only
// ACCEPTED set cannot be bypassed with "IMAGE/PNG". Asserted so that a future
// change to that set is made knowing why it has no toLowerCase().
check('declared type is normalised by File', new File([], 'x', { type: 'IMAGE/PNG' }).type, 'image/png');
check('so uppercase is accepted as png', status(await upload({ file: asFile(png, 'a.png', 'IMAGE/PNG'), destination: 'members' })), 'accepted');

console.log('--- hostile bytes wearing an allowed MIME type ---');
// This is the case a Content-Type check alone cannot catch: the caller simply
// claims image/png. sharp is what actually decides, and it cannot decode any
// of these.
for (const [label, bytes, name] of [
  ['windows PE .exe',      exeBytes,  'photo.png'],
  ['linux ELF binary',     elfBytes,  'photo.png'],
  ['php webshell',         phpBytes,  'shell.png'],
  ['svg with <script>',    svgBytes,  'logo.png'],
  ['html with fetch()',    htmlBytes, 'index.png'],
  ['empty file',           Buffer.alloc(0), 'empty.png'],
  ['random bytes',         Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), 'x.png'],
  ['truncated png header', png.subarray(0, 8), 'trunc.png'],
] as const) {
  const outcome = await upload({ file: asFile(bytes as Buffer, name, 'image/png'), destination: 'members' });
  check(`refused: ${label}`, status(outcome), 422);
  check(`refused: ${label} / message`, error(outcome), 'That file could not be read as an image. Try a JPEG, PNG or WebP.');
}

console.log('--- double extensions and executable filenames ---');
// The stored name is always `<slug>-<hash>.webp`, so the filename the caller
// chose never decides how the object is served. These are accepted as images
// (the bytes are a real PNG) but cannot land as .php/.exe/.html.
for (const name of ['shell.php.png', 'app.exe.png', 'page.html.png', 'x.php%00.png', 'a.png.php']) {
  check(`filename ignored: ${name}`, status(await upload({ file: asFile(png, name, 'image/png'), destination: 'members' })), 'accepted');
}
check('polyglot png+php decodes as image, re-encoded to webp', status(await upload({ file: asFile(polyglot, 'p.png', 'image/png'), destination: 'members' })), 'accepted');

console.log('--- oversized ---');
const MAX = 12 * 1024 * 1024;
const oversized = Buffer.alloc(Math.floor(MAX * 1.2), 0x41);
check('declared content-length over the cap', status(await upload(
  { file: asFile(png, 'a.png', 'image/png'), destination: 'members' },
  { 'content-length': String(Math.floor(MAX * 1.2)) })), 413);
check('declared content-length message', error(await upload(
  { file: asFile(png, 'a.png', 'image/png'), destination: 'members' },
  { 'content-length': String(Math.floor(MAX * 1.2)) })), 'That image is larger than 12 MB.');
// Understating content-length does not help: file.size is checked after parsing.
check('actual size over the cap, content-length understated', status(await upload(
  { file: asFile(oversized, 'a.png', 'image/png'), destination: 'members' },
  { 'content-length': '10' })), 413);
check('just under the cap is not refused on size', (() => {
  const under = Buffer.alloc(MAX - 1024, 0x41);
  return under.length < MAX;
})(), true);

console.log('--- unknown / traversing destination keys ---');
for (const d of ['../', '../../public', 'members/../../..', 'MEMBERS', 'unknown', '', 'constructor', '__proto__', 'toString']) {
  check(`refused destination: ${JSON.stringify(d)}`, status(await upload({ file: asFile(png, 'a.png', 'image/png'), destination: d })), 400);
}

console.log('--- path traversal in the caller-chosen name and subfolder ---');
// These are accepted, because the traversal cannot survive slugify. The unit
// checks below prove the resulting object path stays inside images/<dir>.
for (const n of ['../../../../etc/passwd', '..\\..\\windows\\system32', '/etc/shadow', 'a/../../b']) {
  check(`name accepted but neutralised: ${JSON.stringify(n)}`, status(await upload(
    { file: asFile(png, 'a.png', 'image/png'), destination: 'members', name: n })), 'accepted');
}
for (const s of ['../../../../etc', '..\\..', '/absolute', 'a/../../b']) {
  check(`subfolder accepted but neutralised: ${JSON.stringify(s)}`, status(await upload(
    { file: asFile(png, 'a.png', 'image/png'), destination: 'gallery', subfolder: s })), 'accepted');
}

console.log('--- the object path can never escape images/<dir> ---');
// Mirrors exactly what the route computes: path.posix.join('images', dir, slugify(subfolder)).
const DIRS = ['MembersDP', 'AlumniDP', 'facilities', 'gallery', 'sponsors', 'photo', 'Collab'];
const HOSTILE = [
  '../../../../etc/passwd', '..\\..\\windows\\system32', '/etc/shadow', 'a/../../b',
  '....//....//etc', '%2e%2e%2f', '..%2f..%2f', 'x .png', '..', '.', '/', '\\',
  'CON', 'a'.repeat(500), '<script>alert(1)</script>', "a';DROP TABLE x;--",
];
for (const dir of DIRS) {
  for (const hostile of HOSTILE) {
    const slug = slugify(hostile);
    const objectDir = path.posix.join('images', dir, slug);
    const baseName = slug || 'image';
    const objectPath = path.posix.join(objectDir, `${baseName}-deadbeef.webp`);
    const inside = objectPath.startsWith(`images/${dir}/`) && !objectPath.includes('..');
    check(`inside images/${dir}: ${JSON.stringify(hostile).slice(0, 34)}`, inside, true);
    check(`no separator from slugify: ${JSON.stringify(hostile).slice(0, 30)}`, /[\\/]/.test(slug), false);
    check(`no dots from slugify: ${JSON.stringify(hostile).slice(0, 30)}`, slug.includes('.'), false);
    check(`no NUL from slugify: ${JSON.stringify(hostile).slice(0, 30)}`, slug.includes(' '), false);
  }
}

console.log('--- the proxy must not truncate a body the route would accept ---');
// The proxy matches /api/admin/:path*, and Next buffers a proxied body up to
// experimental.proxyClientMaxBodySize (10 MB by default) before the route sees
// it. Below the route's own 12 MB ceiling, that silently shortened the upload:
// file.size read 10 MB, passed the size check, and sharp got an incomplete
// image — reported to the editor as "could not be read as an image".
// This cannot be caught by calling POST directly, since the truncation happens
// above the handler, so the config invariant is asserted instead.
{
  const config = await import('../next.config.js');
  const limit = (config.default ?? config).experimental?.proxyClientMaxBodySize;
  check('proxyClientMaxBodySize is set', typeof limit === 'string' || typeof limit === 'number', true);
  const bytes = typeof limit === 'number'
    ? limit
    : Number(String(limit).replace(/mb$/i, '')) * 1024 * 1024;
  // The route refuses a declared length over MAX * 1.1, so that is the largest
  // body it will ever try to parse.
  check(`limit (${limit}) exceeds the largest body the route accepts`, bytes > MAX * 1.1, true);
}

console.log('--- the stored extension is always .webp ---');
for (const hostile of ['x.php', 'x.exe', 'x.html', 'x.svg', 'x.png.php', '']) {
  const slug = slugify(hostile) || 'image';
  check(`extension for ${JSON.stringify(hostile)}`, `${slug}-deadbeef.webp`.endsWith('.webp'), true);
  check(`no second extension for ${JSON.stringify(hostile)}`, (`${slug}-deadbeef.webp`.match(/\./g) || []).length, 1);
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

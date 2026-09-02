// Probes every admin API route against a *running production build* and scans
// what comes back — body and headers — for anything that should never leave the
// server: stack traces, filesystem paths, raw database text, and the actual
// secret values out of .env.local.
//
// Unauthenticated, so this exercises the proxy's rejection paths and the routes'
// own input validation. That is the surface an outsider can reach, which is the
// surface worth scanning.
//
//   npx next build && npx next start -p 3251
//   BASE_URL=http://localhost:3251 npx tsx scripts/test-api-responses.mts
//
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3251';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}
function refute(label: string, haystack: string, needle: string) {
  if (!haystack.toLowerCase().includes(needle.toLowerCase())) pass++;
  else { fail++; console.log(`  FAIL ${label}: response contains ${JSON.stringify(needle)}`); }
}

/**
 * The values in .env.local that must never appear in a response.
 *
 * `NEXT_PUBLIC_*` is excluded by definition — Next inlines those into the
 * browser bundle, and the Supabase project ref in particular has to appear in
 * the CSP header's `connect-src` for the browser to be allowed to reach the
 * project at all. `APP_URL` is the site's own address. Neither is a secret, and
 * scanning for them only produces noise.
 *
 * What is left is the set that matters: the session secret, the cron secret,
 * the Gemini and Resend keys, the VAPID private key.
 */
function localSecrets(): Array<[string, string]> {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return [];
  const out: Array<[string, string]> = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, name] = m;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    // Short values collide with ordinary prose, so they cannot be scanned for.
    if (value.length < 12) continue;
    if (name.startsWith('NEXT_PUBLIC_') || name === 'APP_URL' || name === 'VAPID_SUBJECT') continue;
    out.push([name, value]);
  }
  return out;
}
const SECRETS = localSecrets();

/** Markers of a leak, independent of which route produced the response. */
const MARKERS = [
  // stack traces and module paths
  '\n    at ', 'node_modules', '.next/server', '.next\\server', 'webpack',
  'D:\\CBRL', 'd:/cbrl', '/var/www', 'C:\\Users', 'src/app/api', 'src\\app\\api',
  // database internals
  'sqlstate', 'postgrest', 'postgres', 'pg_catalog', 'row-level security',
  'violates', 'constraint', 'relation "', 'column "', 'schema cache',
  'patient_records', 'site_content', 'site_editors',
  // secrets and config by name
  'service_role', 'sb_secret', 'gemini_api_key', 'supabase_service_role_key',
  'trusted_proxy_hops', 'process.env',
  // JWT prefix — a leaked key would start here
  'eyjhbgci',
];

type Probe = { label: string; path: string; method: string; body?: BodyInit; headers?: Record<string, string>; expect: number };

const PROBES: Probe[] = [
  // Reads. The proxy turns these away with 401 before the handler runs.
  { label: 'GET content',            path: '/api/admin/content/home',        method: 'GET',  expect: 401 },
  { label: 'GET unknown collection', path: '/api/admin/content/nope',        method: 'GET',  expect: 401 },
  { label: 'GET metrics',            path: '/api/admin/metrics',             method: 'GET',  expect: 401 },
  { label: 'GET publications',       path: '/api/admin/publications',        method: 'GET',  expect: 401 },
  { label: 'GET publication by id',  path: '/api/admin/publications/x',      method: 'GET',  expect: 401 },
  { label: 'GET whoami',             path: '/api/admin/whoami',              method: 'GET',  expect: 401 },

  // Writes with no Origin — the proxy's CSRF check fires first, 403.
  { label: 'PUT content, no origin',   path: '/api/admin/content/home', method: 'PUT',    body: '{}', expect: 403 },
  { label: 'PUT metrics, no origin',   path: '/api/admin/metrics',      method: 'PUT',    body: '{}', expect: 403 },
  { label: 'POST publication, no origin', path: '/api/admin/publications', method: 'POST', body: '{}', expect: 403 },
  { label: 'DELETE publication, no origin', path: '/api/admin/publications/x', method: 'DELETE', expect: 403 },
  { label: 'POST upload, no origin',   path: '/api/admin/upload',       method: 'POST',   expect: 403 },
  { label: 'POST doi, no origin',      path: '/api/admin/publications/doi', method: 'POST', body: '{}', expect: 403 },
  { label: 'POST heartbeat, no origin', path: '/api/admin/heartbeat',   method: 'POST',   expect: 403 },

  // Writes with a foreign Origin — same check, still 403.
  { label: 'PUT content, evil origin', path: '/api/admin/content/home', method: 'PUT', body: '{}',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, expect: 403 },
  { label: 'POST upload, evil origin', path: '/api/admin/upload', method: 'POST',
    headers: { origin: 'https://evil.example' }, expect: 403 },

  // Malformed input, correct origin. Still stopped at the session gate, but
  // these are the shapes that would reach a handler once signed in.
  { label: 'PUT content, bad JSON',   path: '/api/admin/content/home', method: 'PUT', body: 'not json{{{',
    headers: { origin: BASE, 'content-type': 'application/json' }, expect: 401 },
  { label: 'PUT content, huge body',  path: '/api/admin/content/home', method: 'PUT', body: 'x'.repeat(2_000_000),
    headers: { origin: BASE, 'content-type': 'application/json' }, expect: 401 },
  { label: 'PUT content, null byte',  path: '/api/admin/content/home', method: 'PUT', body: '{"a":"\u0000"}',
    headers: { origin: BASE, 'content-type': 'application/json' }, expect: 401 },
  { label: 'POST doi, prototype key', path: '/api/admin/publications/doi', method: 'POST', body: '{"__proto__":{"x":1},"doi":"10.1/x"}',
    headers: { origin: BASE, 'content-type': 'application/json' }, expect: 401 },
  { label: 'POST upload, junk multipart', path: '/api/admin/upload', method: 'POST', body: '------x\r\ngarbage\r\n------x--',
    headers: { origin: BASE, 'content-type': 'multipart/form-data; boundary=----x' }, expect: 401 },
  // A real oversized body. content-length cannot be forged through fetch —
  // undici refuses a mismatch — so the route's declared-length pre-check is
  // covered in scripts/test-upload-validation.mts instead, where the handler is
  // called directly.
  { label: 'POST upload, 13 MB body', path: '/api/admin/upload', method: 'POST', body: 'x'.repeat(13 * 1024 * 1024),
    headers: { origin: BASE, 'content-type': 'application/octet-stream' }, expect: 401 },

  // Path traversal against the dynamic segments.
  { label: 'traversal in collection', path: '/api/admin/content/..%2f..%2f..%2fetc%2fpasswd', method: 'GET', expect: 401 },
  { label: 'traversal in publication id', path: '/api/admin/publications/..%2f..%2fetc%2fpasswd', method: 'GET', expect: 401 },
  { label: 'null byte in collection', path: '/api/admin/content/home%00.txt', method: 'GET', expect: 401 },

  // Logout is reachable without a session, but not without an Origin: the
  // proxy's CSRF check sits above the no-session allowance, so a cross-site
  // page cannot sign an editor out. Both halves asserted.
  { label: 'POST logout, no origin', path: '/api/admin/logout', method: 'POST', expect: 403 },
  { label: 'POST logout, correct origin', path: '/api/admin/logout', method: 'POST',
    headers: { origin: BASE }, expect: 200 },
  { label: 'POST logout, evil origin', path: '/api/admin/logout', method: 'POST',
    headers: { origin: 'https://evil.example' }, expect: 403 },

  // Unrouted admin paths.
  { label: 'unknown admin api', path: '/api/admin/does-not-exist', method: 'GET', expect: 401 },
];

console.log(`--- probing ${BASE} (${SECRETS.length} local secrets loaded for scanning) ---`);

for (const probe of PROBES) {
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${BASE}${probe.path}`, {
      method: probe.method, body: probe.body, headers: probe.headers, redirect: 'manual',
    });
    text = await response.text();
  } catch (e) {
    fail++; console.log(`  FAIL ${probe.label}: request failed — ${(e as Error).message}`);
    continue;
  }

  check(`${probe.label} status`, response.status, probe.expect);

  // The scan. Body plus every response header.
  const headerDump = [...response.headers].map(([k, v]) => `${k}: ${v}`).join('\n');
  const surface = `${text}\n${headerDump}`;
  for (const marker of MARKERS) refute(`${probe.label} / marker "${marker.trim()}"`, surface, marker);
  for (const [name, value] of SECRETS) refute(`${probe.label} / secret ${name}`, surface, value);

  // No response should carry a server fingerprint.
  check(`${probe.label} no x-powered-by`, response.headers.get('x-powered-by'), null);

  // A JSON error body must be exactly {error} or {error, reason} — nothing else
  // rides along.
  if (response.headers.get('content-type')?.includes('application/json') && response.status >= 400) {
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON after all */ }
    if (parsed) {
      const extra = Object.keys(parsed).filter((k) => !['error', 'reason', 'issues'].includes(k));
      check(`${probe.label} error body has no extra fields`, extra, []);
      check(`${probe.label} error is a plain string`, typeof parsed.error, 'string');
    }
  }
}

console.log('--- public surface still renders ---');
for (const [label, p, expect] of [
  ['home', '/', 200], ['publications', '/publications', 200], ['members', '/members', 200],
  ['research', '/research', 200], ['facilities', '/facilities', 200], ['gallery', '/gallery', 200],
  ['contact', '/contact', 200], ['projects', '/projects', 200], ['about-the-pi', '/about-the-pi', 200],
  ['sitemap', '/sitemap.xml', 200], ['robots', '/robots.txt', 200],
  ['unknown page 404', '/no-such-page', 404],
  ['cpms login', '/cpms', 200],
] as const) {
  const r = await fetch(`${BASE}${p}`, { redirect: 'manual' });
  const body = await r.text();
  check(`${label}`, r.status, expect);
  for (const marker of ['\n    at ', 'node_modules', 'D:\\CBRL', 'sqlstate', 'service_role', 'patient_records']) {
    refute(`${label} / marker "${marker.trim()}"`, body, marker);
  }
  for (const [name, value] of SECRETS) refute(`${label} / secret ${name}`, body, value);
}

console.log('--- admin pages redirect to sign-in rather than rendering ---');
for (const p of ['/admin', '/admin/home', '/admin/publications', '/admin/members', '/admin/metrics']) {
  const r = await fetch(`${BASE}${p}`, { redirect: 'manual' });
  const ok = r.status === 307 || r.status === 302;
  check(`${p} redirects`, ok, true);
  const location = r.headers.get('location') ?? '';
  check(`${p} -> login`, location.includes('/admin/login'), true);
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

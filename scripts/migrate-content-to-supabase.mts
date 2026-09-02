/**
 * One-time migration: content/*.json + public/data/* → the site_content table.
 *
 * Run once, when switching the dashboard over to Supabase:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-content-to-supabase.mts
 *
 * Idempotent — re-running overwrites each row with what is on disk, so it is
 * safe to repeat if it fails part way. It is *not* safe to run casually once
 * editors have started saving: it would roll every collection back to the last
 * committed copy. The previous values land in site_content_versions, so that is
 * recoverable, but it is not something to do by accident. Name collections on
 * the command line to seed only those — see `only` below.
 *
 * ## Why this one script uses the service-role key
 *
 * Nothing else in this repository does, and the deployed application must never
 * hold one — see src/lib/supabase/config.ts. Writes to site_content are
 * authorised by RLS against `is_site_editor()`, which means they need a signed-in
 * editor, and there is no editor to sign in as until the first grant exists.
 * This script breaks that circle and is the only thing that needs to.
 *
 * Get the key from Supabase → Project Settings → API → service_role. Pass it on
 * the command line as above; do not add it to .env.local, where the app would
 * pick it up.
 */

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

/**
 * Next loads these for us; a bare tsx run does not. Only fills in what is
 * missing, so an explicit value on the command line always wins — which is how
 * the service-role key is meant to be supplied.
 *
 * .env.local holds everything now. The Supabase URL used to sit in a separate
 * .env.shared, read by both this script and the two next.config files, back
 * when CPMS was a second Next app with its own project root.
 */
function loadEnvFiles(): void {
  for (const file of ['.env.local']) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!match) continue;
        const [, key, value] = match;
        if (process.env[key] === undefined) {
          process.env[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      // Absent — the values may be exported in the environment instead.
    }
  }
}

loadEnvFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error('NEXT_PUBLIC_SUPABASE_URL is not set. Is .env.local loaded?');
  process.exit(1);
}
if (!serviceKey) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set.\n\n' +
      'Get it from Supabase → Project Settings → API → service_role, then set it for\n' +
      'this one command rather than storing it in .env.local, where the app would\n' +
      'pick it up.\n\n' +
      '  PowerShell:\n' +
      '    $env:SUPABASE_SERVICE_ROLE_KEY = "<key>"; npm run migrate:content\n' +
      '    Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY      # clear it afterwards\n\n' +
      '  bash / zsh:\n' +
      '    SUPABASE_SERVICE_ROLE_KEY=<key> npm run migrate:content\n'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const root = process.cwd();

/** JSON collections, stored in site_content.data. */
const jsonSources: { collection: string; file: string }[] = [
  { collection: 'home', file: path.join(root, 'content', 'home.json') },
  { collection: 'members', file: path.join(root, 'content', 'members.json') },
  { collection: 'projects', file: path.join(root, 'content', 'projects.json') },
  { collection: 'research', file: path.join(root, 'content', 'research.json') },
  { collection: 'gallery', file: path.join(root, 'content', 'gallery.json') },
  { collection: 'facilities', file: path.join(root, 'content', 'facilities.json') },
  { collection: 'about', file: path.join(root, 'content', 'about.json') },
  { collection: 'metrics', file: path.join(root, 'public', 'data', 'metrics.json') },
];

/** Documents, stored in site_content.raw. The publication list is BibTeX. */
const rawSources: { collection: string; file: string }[] = [
  { collection: 'publications', file: path.join(root, 'public', 'data', 'publications.bib') },
];

/**
 * Optional collection names on the command line narrow the run:
 *
 *   npm run migrate:content -- about
 *
 * Which is how a *newly added* collection is seeded once the others are already
 * being edited from the dashboard — a full run would roll every one of them
 * back to its last committed copy.
 */
const only = new Set(process.argv.slice(2));
const wanted = ({ collection }: { collection: string }) =>
  only.size === 0 || only.has(collection);

const known = [...jsonSources, ...rawSources].map((s) => s.collection);
const unknown = [...only].filter((name) => !known.includes(name));
if (unknown.length) {
  console.error(
    `Not a content collection: ${unknown.join(', ')}.
` +
      `Known collections: ${known.join(', ')}.`
  );
  process.exit(1);
}

let failures = 0;

for (const { collection, file } of jsonSources.filter(wanted)) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    // `raw: null` is explicit: the table's CHECK constraint requires exactly one
    // of data/raw, and an upsert over an existing row would otherwise leave a
    // stale raw in place and fail.
    const { error } = await supabase
      .from('site_content')
      .upsert({ collection, data: parsed, raw: null }, { onConflict: 'collection' });

    if (error) throw error;
    console.log(`  ✓ ${collection.padEnd(12)} ${(JSON.stringify(parsed).length / 1024).toFixed(1)} KB`);
  } catch (error) {
    failures++;
    console.error(`  ✗ ${collection.padEnd(12)} ${error instanceof Error ? error.message : error}`);
  }
}

for (const { collection, file } of rawSources.filter(wanted)) {
  try {
    const text = await readFile(file, 'utf8');
    const { error } = await supabase
      .from('site_content')
      .upsert({ collection, raw: text, data: null }, { onConflict: 'collection' });

    if (error) throw error;
    console.log(`  ✓ ${collection.padEnd(12)} ${(text.length / 1024).toFixed(1)} KB`);
  } catch (error) {
    failures++;
    console.error(`  ✗ ${collection.padEnd(12)} ${error instanceof Error ? error.message : error}`);
  }
}

const { count } = await supabase
  .from('site_content')
  .select('collection', { count: 'exact', head: true });

console.log(`\n${count ?? 0} collections in site_content.`);

if (failures > 0) {
  console.error(`${failures} collection(s) failed. Re-run once the cause is fixed.`);
  process.exit(1);
}

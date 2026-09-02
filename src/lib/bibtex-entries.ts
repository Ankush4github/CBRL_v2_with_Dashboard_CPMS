/**
 * Entry-level editing for `public/data/publications.bib`.
 *
 * The public site parses that file with `@/lib/bibtex-parser`, which keeps
 * only the handful of fields it renders. Editing through *that* shape would
 * silently drop `keywords`, `issn`, `abstract` and friends on every save, so
 * the dashboard works on raw entry blocks instead: it locates the one block
 * being edited, rewrites it from a complete field list, and leaves every other
 * byte of the file exactly as it was.
 */

export interface BibField {
  name: string;
  value: string;
}

export interface BibEntry {
  /**
   * What the editor addresses an entry by. Normally the citation key; four
   * entries in the current file share a key with another (the same paper listed
   * twice), so repeats get a `~2` suffix to stay individually addressable.
   */
  id: string;
  /** `article`, `inbook`, … lowercased. */
  type: string;
  /** Citation key exactly as written — not guaranteed unique. */
  key: string;
  /** The original text of this entry, including `@type{…}`. */
  raw: string;
  /** Offsets into the source file. */
  start: number;
  end: number;
  fields: BibField[];
}

/** Fields the editor shows as first-class inputs, in display order. */
export const CORE_FIELDS = [
  'title',
  'author',
  'journal',
  'booktitle',
  'year',
  'volume',
  'number',
  'pages',
  'publisher',
  'editor',
  'doi',
  'url',
] as const;

/**
 * Read `name = value` pairs out of an entry body, honouring nested braces and
 * quoted values. Order is preserved so a rewritten entry still reads like the
 * one the publisher exported.
 */
function parseFields(body: string): BibField[] {
  const fields: BibField[] = [];
  let i = 0;

  const skipSpace = () => {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
  };

  while (i < body.length) {
    skipSpace();
    if (i >= body.length) break;

    const nameStart = i;
    while (i < body.length && !/[=\s]/.test(body[i])) i++;
    const name = body.slice(nameStart, i).trim();
    if (!name) break;

    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== '=') {
      // Not a field assignment — skip to the next comma and carry on.
      while (i < body.length && body[i] !== ',') i++;
      continue;
    }
    i++; // '='
    while (i < body.length && /\s/.test(body[i])) i++;

    let value = '';
    if (body[i] === '{') {
      let depth = 0;
      const start = i;
      for (; i < body.length; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
      value = body.slice(start + 1, i - 1);
    } else if (body[i] === '"') {
      const start = ++i;
      while (i < body.length && body[i] !== '"') i++;
      value = body.slice(start, i);
      i++;
    } else {
      const start = i;
      while (i < body.length && body[i] !== ',' && body[i] !== '\n') i++;
      value = body.slice(start, i);
    }

    fields.push({ name: name.toLowerCase(), value: value.trim() });
  }

  return fields;
}

/** Every entry in the file, in file order. */
export function splitEntries(source: string): BibEntry[] {
  const entries: BibEntry[] = [];
  // A few keys in the file contain spaces ("@article{Pradyumna Kumar Mishra,"),
  // so the key runs to the first comma rather than the first space.
  const header = /@(\w+)\s*\{\s*([^,{}]+?)\s*,/g;
  const seen = new Map<string, number>();
  let match: RegExpExecArray | null;

  while ((match = header.exec(source)) !== null) {
    const start = match.index;
    const braceOpen = source.indexOf('{', start);
    if (braceOpen === -1) break;

    let depth = 0;
    let i = braceOpen;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }

    const end = Math.min(i + 1, source.length);
    const body = source.slice(braceOpen + 1, i);
    // Body opens with the citation key and a comma; fields follow.
    const afterKey = body.indexOf(',');

    const key = match[2];
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);

    entries.push({
      id: occurrence === 1 ? key : `${key}~${occurrence}`,
      type: match[1].toLowerCase(),
      key,
      raw: source.slice(start, end),
      start,
      end,
      fields: afterKey === -1 ? [] : parseFields(body.slice(afterKey + 1)),
    });

    header.lastIndex = end;
  }

  return entries;
}

/** Entry ids that share a citation key with another entry. */
export function duplicateKeys(entries: BibEntry[]): Set<string> {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
  return new Set(
    entries.filter((e) => (counts.get(e.key) ?? 0) > 1).map((e) => e.id)
  );
}

/** Braces must stay balanced or the entry would swallow the rest of the file. */
export function bracesBalanced(value: string): boolean {
  let depth = 0;
  for (const c of value) {
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

export function formatEntry(type: string, key: string, fields: BibField[]): string {
  const rows = fields
    .filter((f) => f.name.trim() && f.value.trim())
    .map((f) => `    ${f.name.trim().toLowerCase()} = {${f.value.trim()}}`);

  return `@${type.trim().toLowerCase()}{${key.trim()},\n${rows.join(',\n')}\n}`;
}

/** A citation key that is unique in the file and safe inside `@type{…,`. */
export function makeCitationKey(
  source: string,
  author: string,
  year: string | number,
  title: string
): string {
  const surname =
    author
      .split(/\s+and\s+/)[0]
      ?.split(',')[0]
      ?.trim()
      .split(/\s+/)
      .pop() ?? 'CBRL';

  const word = title.split(/\s+/).find((w) => w.length > 3) ?? '';
  const base =
    `${surname}${year}${word}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || `CBRL${Date.now()}`;

  const existing = new Set(splitEntries(source).map((e) => e.key.toLowerCase()));
  if (!existing.has(base.toLowerCase())) return base;

  let n = 2;
  while (existing.has(`${base}${n}`.toLowerCase())) n++;
  return `${base}${n}`;
}

export function findEntry(source: string, id: string): BibEntry | undefined {
  return splitEntries(source).find((e) => e.id === id);
}

/** Swap one entry's text, leaving the surrounding file untouched. */
export function replaceEntry(source: string, id: string, replacement: string): string {
  const entry = findEntry(source, id);
  if (!entry) throw new Error(`No entry found for "${id}".`);
  return source.slice(0, entry.start) + replacement + source.slice(entry.end);
}

export function removeEntry(source: string, id: string): string {
  const entry = findEntry(source, id);
  if (!entry) throw new Error(`No entry found for "${id}".`);

  // Take the blank line that separated it too, so the file keeps its rhythm.
  let end = entry.end;
  while (end < source.length && /[ \t\r]/.test(source[end])) end++;
  if (source[end] === '\n') end++;
  return source.slice(0, entry.start) + source.slice(end);
}

/** New entries go on top — the file is newest-first. */
export function prependEntry(source: string, entryText: string): string {
  return `${entryText}\n\n${source.replace(/^\s+/, '')}`;
}

/* --------------------------------------------------------- request payloads */

export const ENTRY_TYPES = [
  'article',
  'inproceedings',
  'incollection',
  'inbook',
  'book',
  'phdthesis',
  'misc',
] as const;

export interface EntryPayload {
  type: string;
  key: string;
  fields: BibField[];
}

/**
 * Check and clean what the editor posts for a single entry. Anything that
 * could corrupt the file — unbalanced braces, a key containing a comma, a
 * field name with spaces — is rejected rather than written.
 */
export function parseEntryPayload(
  input: unknown,
  source: string
): { ok: true; value: EntryPayload } | { ok: false; error: string } {
  const body = (input ?? {}) as Record<string, unknown>;

  const type = String(body.type ?? 'article').trim().toLowerCase();
  if (!/^[a-z]+$/.test(type)) {
    return { ok: false, error: 'Entry type must be a single word such as "article".' };
  }

  const rawFields = Array.isArray(body.fields) ? body.fields : [];
  const fields: BibField[] = [];

  for (const item of rawFields) {
    const field = (item ?? {}) as Record<string, unknown>;
    const name = String(field.name ?? '').trim().toLowerCase();
    const value = String(field.value ?? '').trim();
    if (!name && !value) continue;

    if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
      return { ok: false, error: `"${name || '(blank)'}" is not a valid field name.` };
    }
    if (!bracesBalanced(value)) {
      return { ok: false, error: `The ${name} field has unbalanced { } braces.` };
    }
    if (value) fields.push({ name, value });
  }

  const title = fields.find((f) => f.name === 'title')?.value ?? '';
  const year = fields.find((f) => f.name === 'year')?.value ?? '';
  const author = fields.find((f) => f.name === 'author')?.value ?? '';

  if (!title) return { ok: false, error: 'A title is required.' };
  if (!/^\d{4}$/.test(year)) return { ok: false, error: 'Year must be four digits.' };

  let key = String(body.key ?? '').trim();
  // One entry in the file has no citation key at all, so its parsed "key" is a
  // stray `doi = …` fragment. Rather than write that back, mint a real one.
  if (!key || /[,{}=]/.test(key)) {
    key = makeCitationKey(source, author, year, title);
  }

  return { ok: true, value: { type, key, fields } };
}

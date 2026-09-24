/**
 * Runtime validation for everything the dashboard writes back to `content/`.
 *
 * The dashboard is the only writer, so this is a guard against a malformed
 * payload corrupting a page rather than a general-purpose schema library —
 * hence a few dozen lines here instead of a dependency.
 *
 * Every validator *normalises* as it checks: unknown keys are dropped, strings
 * are trimmed, and absent optionals stay absent. What comes out is exactly what
 * gets written to disk.
 */

import {
  CONTENT_COLLECTIONS,
  MEMBER_GROUPS,
  PROFILE_KEYS,
  slugify,
  type AboutContent,
  type AboutEntry,
  type ContentCollection,
  type ContentMap,
  type FacilitiesContent,
  type GalleryContent,
  type HomeContent,
  type MembersContent,
  type MetricsContent,
  type ProjectsContent,
  type ResearchContent,
} from './content-types';
import { SUPABASE_URL } from './supabase/config';

/**
 * Absolute prefix that dashboard uploads now arrive with.
 *
 * Uploads no longer land in `public/`: api/admin/upload/route.ts stores them in
 * the `site-media` bucket and returns that bucket's public URL, which is
 * absolute. The site-relative rule in assetPath() below was written when
 * uploads were files on disk, and on its own it rejects every image the
 * dashboard itself produces.
 *
 * This is not a widening of what the site may point at. next.config.js already
 * pins the image optimizer's remotePatterns to exactly this prefix — it is the
 * single external origin the site is built to render from, and the bucket
 * accepts image/webp only.
 *
 * Empty string when Supabase is unconfigured, and the check below is guarded on
 * that: `''` would make startsWith() match every string and accept any origin.
 */
const SITE_MEDIA_PREFIX = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/site-media/`
  : '';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

class Ctx {
  issues: ValidationIssue[] = [];

  fail(path: string, message: string) {
    this.issues.push({ path, message });
  }

  /** Trimmed string. Reports when `required` and empty. */
  str(value: unknown, path: string, opts: { required?: boolean; max?: number } = {}): string {
    if (typeof value !== 'string') {
      if (opts.required) this.fail(path, 'is required');
      else if (value != null) this.fail(path, 'must be text');
      return '';
    }
    const trimmed = value.trim();
    if (opts.required && !trimmed) this.fail(path, 'is required');
    if (opts.max && trimmed.length > opts.max) {
      this.fail(path, `must be ${opts.max} characters or fewer`);
    }
    return trimmed;
  }

  /** Trimmed string, or undefined when blank — keeps optionals out of the JSON. */
  opt(value: unknown, path: string, opts: { max?: number } = {}): string | undefined {
    if (value == null || value === '') return undefined;
    const s = this.str(value, path, opts);
    return s === '' ? undefined : s;
  }

  int(value: unknown, path: string, opts: { min?: number; max?: number } = {}): number {
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      this.fail(path, 'must be a number');
      return 0;
    }
    const rounded = Math.round(n);
    if (opts.min != null && rounded < opts.min) this.fail(path, `must be at least ${opts.min}`);
    if (opts.max != null && rounded > opts.max) this.fail(path, `must be at most ${opts.max}`);
    return rounded;
  }

  bool(value: unknown): boolean {
    return value === true || value === 'true';
  }

  arr(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
      this.fail(path, 'must be a list');
      return [];
    }
    return value;
  }

  /** List of non-empty trimmed strings (blank rows in the editor are dropped). */
  strList(value: unknown, path: string): string[] {
    return this.arr(value, path)
      .map((v, i) => this.str(v, `${path}[${i}]`))
      .filter(Boolean);
  }

  /**
   * Site-relative asset path. Rejects absolute URLs and `..` so a saved record
   * can never point the site at another origin or walk out of `public/`.
   */
  assetPath(value: unknown, path: string, opts: { required?: boolean } = {}): string {
    const s = opts.required ? this.str(value, path, { required: true }) : this.opt(value, path) ?? '';
    if (!s) return '';

    // `..` is rejected on both shapes: it walks out of `public/` on a site path
    // and out of the bucket on a storage URL.
    if (!s.includes('..')) {
      // Site-relative, as before. `//` is protocol-relative and resolves to
      // another host entirely, so it stays rejected.
      if (s.startsWith('/') && !s.startsWith('//')) return s;
      // An image the dashboard uploaded. Prefix match, not `includes`, so a
      // URL that merely mentions the bucket somewhere does not pass.
      if (SITE_MEDIA_PREFIX && s.startsWith(SITE_MEDIA_PREFIX)) return s;
    }

    this.fail(path, 'must be a site path such as /images/… or an image uploaded from the dashboard');
    return '';
  }

  /** http(s), mailto: or site-relative link. */
  link(value: unknown, path: string): string | undefined {
    const s = this.opt(value, path);
    if (!s) return undefined;
    // A site path must not be `//host` or `/\host`: browsers resolve both as
    // protocol-relative, to another origin, the same hole assetPath closes.
    if (/^(https?:\/\/|mailto:|\/(?![/\\]))/i.test(s)) return s;
    this.fail(path, 'must start with https://, mailto: or a single /');
    return undefined;
  }

  email(value: unknown, path: string, opts: { required?: boolean } = {}): string {
    const s = opts.required ? this.str(value, path, { required: true }) : this.opt(value, path) ?? '';
    if (!s) return '';
    // Several members list two addresses separated by a comma.
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    const bad = parts.filter((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
    if (bad.length) this.fail(path, 'must be a valid email address');
    return parts.join(', ');
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Drop keys whose value is undefined so they never reach the JSON file. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

/* --------------------------------------------------------------- home page */

function validateHome(input: unknown, c: Ctx): HomeContent {
  const root = asRecord(input);
  const hero = asRecord(root.hero);

  const slides = c.arr(hero.slides ?? [], 'hero.slides').map((row, i) => {
    const r = asRecord(row);
    const p = `hero.slides[${i}]`;
    return {
      src: c.assetPath(r.src, `${p}.src`, { required: true }),
      alt: c.str(r.alt, `${p}.alt`, { required: true, max: 200 }),
    };
  });
  // An empty carousel leaves the hero a bare black rectangle.
  if (slides.length === 0) c.fail('hero.slides', 'needs at least one image');

  const collaborators = c.arr(root.collaborators ?? [], 'collaborators').map((row, i) => {
    const r = asRecord(row);
    const p = `collaborators[${i}]`;
    const intrinsic = c.arr(r.intrinsic ?? [], `${p}.intrinsic`);

    return compact({
      src: c.assetPath(r.src, `${p}.src`, { required: true }),
      alt: c.str(r.alt, `${p}.alt`, { required: true, max: 200 }),
      name: c.str(r.name, `${p}.name`, { required: true, max: 120 }),
      width: c.int(r.width, `${p}.width`, { min: 20, max: 400 }),
      // The rendered height is derived from this ratio, so both halves have to
      // be real pixel counts or the reserved space is wrong and the row shifts.
      intrinsic: [
        c.int(intrinsic[0], `${p}.intrinsic[0]`, { min: 1, max: 10000 }),
        c.int(intrinsic[1], `${p}.intrinsic[1]`, { min: 1, max: 10000 }),
      ] as [number, number],
      row: r.row === 2 || r.row === '2' ? (2 as const) : (1 as const),
      href: c.link(r.href, `${p}.href`),
    });
  });

  return { hero: { slides }, collaborators };
}

/* ------------------------------------------------------------------ members */

function validateMembers(input: unknown, c: Ctx): MembersContent {
  const root = asRecord(input);
  const out = {} as MembersContent;
  const seen = new Set<string>();

  for (const group of MEMBER_GROUPS) {
    const rows = c.arr(root[group] ?? [], group);
    out[group] = rows.map((row, i) => {
      const r = asRecord(row);
      const p = `${group}[${i}]`;
      const name = c.str(r.name, `${p}.name`, { required: true, max: 160 });

      let id = c.opt(r.id, `${p}.id`) ?? slugify(name);
      if (!id) id = `${group}-${i + 1}`;
      // Anchors must stay unique — /members#imon-mitra has to land on one card.
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}-${n}`)) n++;
        id = `${id}-${n}`;
      }
      seen.add(id);

      const profilesInput = asRecord(r.profiles);
      const profiles: Record<string, string> = {};
      for (const key of PROFILE_KEYS) {
        const url = c.link(profilesInput[key], `${p}.profiles.${key}`);
        if (url) profiles[key] = url;
      }

      const joinedDate = c.opt(r.joinedDate, `${p}.joinedDate`);
      if (joinedDate && !/^\d{4}-\d{2}$/.test(joinedDate)) {
        c.fail(`${p}.joinedDate`, 'must be formatted YYYY-MM');
      }

      return compact({
        id,
        name,
        title: c.str(r.title, `${p}.title`, { required: true, max: 160 }),
        image: c.assetPath(r.image, `${p}.image`) || undefined,
        bio: c.opt(r.bio, `${p}.bio`, { max: 2000 }),
        research: c.opt(r.research, `${p}.research`, { max: 500 }),
        phone: c.opt(r.phone, `${p}.phone`, { max: 60 }),
        email: c.email(r.email, `${p}.email`),
        joinedDate,
        qualifications: c.opt(r.qualifications, `${p}.qualifications`, { max: 2000 }),
        profiles: Object.keys(profiles).length ? profiles : undefined,
        responsibilities: c.opt(r.responsibilities, `${p}.responsibilities`, { max: 2000 }),
        currentPosition: c.opt(r.currentPosition, `${p}.currentPosition`, { max: 400 }),
        thesisTitle: c.opt(r.thesisTitle, `${p}.thesisTitle`, { max: 600 }),
      });
    });
  }

  return out;
}

/* ----------------------------------------------------------------- projects */

function validateProjects(input: unknown, c: Ctx): ProjectsContent {
  const root = asRecord(input);
  const usedIds = new Set<number>();
  let nextId = 1;

  const ongoing = c.arr(root.ongoing ?? [], 'ongoing').map((row, i) => {
    const r = asRecord(row);
    const p = `ongoing[${i}]`;
    let id = typeof r.id === 'number' ? Math.round(r.id) : Number(r.id);
    if (!Number.isFinite(id) || id <= 0 || usedIds.has(id)) {
      while (usedIds.has(nextId)) nextId++;
      id = nextId;
    }
    usedIds.add(id);

    return {
      id,
      title: c.str(r.title, `${p}.title`, { required: true, max: 300 }),
      icon: c.opt(r.icon, `${p}.icon`, { max: 8 }) ?? '🔬',
      shortDescription: c.str(r.shortDescription, `${p}.shortDescription`, { required: true, max: 600 }),
      duration: c.str(r.duration, `${p}.duration`, { max: 120 }),
      funding: c.str(r.funding, `${p}.funding`, { max: 200 }),
      role: c.str(r.role, `${p}.role`, { max: 120 }),
      detailedDescription: c.str(r.detailedDescription, `${p}.detailedDescription`, { max: 4000 }),
      objectives: c.strList(r.objectives, `${p}.objectives`),
      methodology: c.str(r.methodology, `${p}.methodology`, { max: 4000 }),
      expectedOutcomes: c.str(r.expectedOutcomes, `${p}.expectedOutcomes`, { max: 4000 }),
    };
  });

  const sponsors = c.arr(root.sponsors ?? [], 'sponsors').map((row, i) => {
    const r = asRecord(row);
    const p = `sponsors[${i}]`;
    return {
      src: c.assetPath(r.src, `${p}.src`, { required: true }),
      alt: c.str(r.alt, `${p}.alt`, { required: true, max: 200 }),
      width: c.int(r.width, `${p}.width`, { min: 1, max: 6000 }),
      height: c.int(r.height, `${p}.height`, { min: 1, max: 6000 }),
    };
  });

  return {
    ongoing,
    completedPdf: c.assetPath(root.completedPdf, 'completedPdf'),
    sponsors,
  };
}

/* ----------------------------------------------------------------- research */

function validateResearch(input: unknown, c: Ctx): ResearchContent {
  const root = asRecord(input);
  const seenTopics = new Set<string>();

  const areas = c.arr(root.areas ?? [], 'areas').map((row, i) => {
    const r = asRecord(row);
    const p = `areas[${i}]`;
    const title = c.str(r.title, `${p}.title`, { required: true, max: 200 });

    return {
      // The area id is a scroll anchor linked from the nav, so keep whatever is
      // already there rather than re-deriving it from an edited title.
      id: c.opt(r.id, `${p}.id`) ?? slugify(title) ?? `area-${i + 1}`,
      index: c.opt(r.index, `${p}.index`, { max: 4 }) ?? String(i + 1).padStart(2, '0'),
      title,
      tagline: c.str(r.tagline, `${p}.tagline`, { max: 200 }),
      description: c.str(r.description, `${p}.description`, { max: 1000 }),
      topics: c.arr(r.topics ?? [], `${p}.topics`).map((t, j) => {
        const tr = asRecord(t);
        const tp = `${p}.topics[${j}]`;
        const topicTitle = c.str(tr.title, `${tp}.title`, { required: true, max: 200 });

        let id = c.opt(tr.id, `${tp}.id`) ?? slugify(topicTitle) ?? `topic-${j + 1}`;
        // Accordion item values must be unique across the whole page.
        if (seenTopics.has(id)) {
          let n = 2;
          while (seenTopics.has(`${id}-${n}`)) n++;
          id = `${id}-${n}`;
        }
        seenTopics.add(id);

        return {
          id,
          title: topicTitle,
          summary: c.str(tr.summary, `${tp}.summary`, { max: 300 }),
          body: c.strList(tr.body, `${tp}.body`),
        };
      }),
    };
  });

  return { areas };
}

/* ------------------------------------------------------------------ gallery */

function validateGallery(input: unknown, c: Ctx): GalleryContent {
  const root = asRecord(input);
  const categories = c.strList(root.categories ?? [], 'categories');
  const usedIds = new Set<number>();
  let nextId = 1;

  const albums = c.arr(root.albums ?? [], 'albums').map((row, i) => {
    const r = asRecord(row);
    const p = `albums[${i}]`;

    let id = typeof r.id === 'number' ? Math.round(r.id) : Number(r.id);
    if (!Number.isFinite(id) || id <= 0 || usedIds.has(id)) {
      while (usedIds.has(nextId)) nextId++;
      id = nextId;
    }
    usedIds.add(id);

    const category = c.str(r.category, `${p}.category`, { required: true, max: 80 });
    if (category && categories.length && !categories.includes(category)) {
      c.fail(`${p}.category`, `must be one of: ${categories.join(', ')}`);
    }

    const images = c
      .arr(r.images ?? [], `${p}.images`)
      .map((v, j) => c.assetPath(v, `${p}.images[${j}]`))
      .filter(Boolean);

    return compact({
      id,
      title: c.str(r.title, `${p}.title`, { required: true, max: 200 }),
      caption: c.str(r.caption, `${p}.caption`, { max: 400 }),
      date: c.str(r.date, `${p}.date`, { max: 60 }),
      category,
      image: c.assetPath(r.image, `${p}.image`, { required: true }),
      images: images.length ? images : undefined,
      description: c.str(r.description, `${p}.description`, { max: 3000 }),
      likes: c.int(r.likes ?? 0, `${p}.likes`, { min: 0, max: 100000 }),
      isLiked: c.bool(r.isLiked),
    });
  });

  return { categories, albums };
}

/* --------------------------------------------------------------- facilities */

function validateFacilities(input: unknown, c: Ctx): FacilitiesContent {
  const root = asRecord(input);

  const stats = c.arr(root.stats ?? [], 'stats').map((row, i) => {
    const r = asRecord(row);
    return {
      value: c.str(r.value, `stats[${i}].value`, { required: true, max: 20 }),
      label: c.str(r.label, `stats[${i}].label`, { required: true, max: 40 }),
    };
  });

  const instruments = c.arr(root.instruments ?? [], 'instruments').map((row, i) => {
    const r = asRecord(row);
    const p = `instruments[${i}]`;
    const inCharge = asRecord(r.inCharge);

    return compact({
      title: c.str(r.title, `${p}.title`, { required: true, max: 160 }),
      subtitle: c.opt(r.subtitle, `${p}.subtitle`, { max: 200 }),
      imageSrc: c.assetPath(r.imageSrc, `${p}.imageSrc`, { required: true }),
      imageAlt: c.str(r.imageAlt, `${p}.imageAlt`, { required: true, max: 200 }),
      features: c.strList(r.features, `${p}.features`),
      fundingSource: c.str(r.fundingSource, `${p}.fundingSource`, { max: 400 }),
      inCharge: {
        name: c.str(inCharge.name, `${p}.inCharge.name`, { max: 160 }),
        title: c.str(inCharge.title, `${p}.inCharge.title`, { max: 160 }),
        email: c.email(inCharge.email, `${p}.inCharge.email`),
        link: c.link(inCharge.link, `${p}.inCharge.link`) ?? '',
      },
    });
  });

  const charges = c.arr(root.charges ?? [], 'charges').map((row, i) => {
    const r = asRecord(row);
    const p = `charges[${i}]`;
    return {
      title: c.str(r.title, `${p}.title`, { required: true, max: 160 }),
      duration: c.str(r.duration, `${p}.duration`, { max: 60 }),
      prices: c.arr(r.prices ?? [], `${p}.prices`).map((t, j) => {
        const tr = asRecord(t);
        return {
          label: c.str(tr.label, `${p}.prices[${j}].label`, { required: true, max: 80 }),
          value: c.str(tr.value, `${p}.prices[${j}].value`, { required: true, max: 40 }),
        };
      }),
    };
  });

  return {
    stats,
    instruments,
    charges,
    chargesNote: c.str(root.chargesNote, 'chargesNote', { max: 300 }),
  };
}

/* ------------------------------------------------------------ about the PI */

/** Eyebrow + heading, shared by every band of the page. */
function headingPair(
  input: unknown,
  c: Ctx,
  path: string
): { eyebrow: string; heading: string } {
  const r = asRecord(input);
  return {
    eyebrow: c.str(r.eyebrow, `${path}.eyebrow`, { max: 60 }),
    heading: c.str(r.heading, `${path}.heading`, { required: true, max: 120 }),
  };
}

/** Title + optional description rows — awards, research impact. */
function entryList(input: unknown, c: Ctx, path: string): AboutEntry[] {
  return c
    .arr(input ?? [], path)
    .map((row, i) => {
      const r = asRecord(row);
      return {
        title: c.str(r.title, `${path}[${i}].title`, { max: 200 }),
        description: c.str(r.description, `${path}[${i}].description`, { max: 600 }),
      };
    })
    // A row with neither half renders as an empty bullet, so drop it rather
    // than making the editor delete it by hand.
    .filter((entry) => entry.title || entry.description);
}

function validateAbout(input: unknown, c: Ctx): AboutContent {
  const root = asRecord(input);
  const hero = asRecord(root.hero);
  const profile = asRecord(root.profile);
  const biography = asRecord(root.biography);
  const awards = asRecord(root.awards);
  const impact = asRecord(root.impact);
  const contact = asRecord(root.contact);

  return {
    hero: {
      image: c.assetPath(hero.image, 'hero.image', { required: true }),
      imageAlt: c.str(hero.imageAlt, 'hero.imageAlt', { required: true, max: 200 }),
      eyebrow: c.str(hero.eyebrow, 'hero.eyebrow', { max: 60 }),
      title: c.str(hero.title, 'hero.title', { required: true, max: 160 }),
      lead: c.str(hero.lead, 'hero.lead', { max: 400 }),
    },
    profile: {
      image: c.assetPath(profile.image, 'profile.image', { required: true }),
      imageAlt: c.str(profile.imageAlt, 'profile.imageAlt', { required: true, max: 200 }),
      eyebrow: c.str(profile.eyebrow, 'profile.eyebrow', { max: 60 }),
      name: c.str(profile.name, 'profile.name', { required: true, max: 160 }),
      position: c.str(profile.position, 'profile.position', { max: 200 }),
      institution: c.str(profile.institution, 'profile.institution', { max: 200 }),
      email: c.email(profile.email, 'profile.email', { required: true }),
      phone: c.str(profile.phone, 'profile.phone', { max: 60 }),
    },
    stats: c.arr(root.stats ?? [], 'stats').map((row, i) => {
      const r = asRecord(row);
      return {
        value: c.str(r.value, `stats[${i}].value`, { required: true, max: 40 }),
        label: c.str(r.label, `stats[${i}].label`, { required: true, max: 40 }),
      };
    }),
    biography: {
      ...headingPair(biography, c, 'biography'),
      // Each entry is one <p>; blank ones would render as gaps.
      paragraphs: c.strList(biography.paragraphs ?? [], 'biography.paragraphs'),
    },
    awards: {
      ...headingPair(awards, c, 'awards'),
      items: entryList(awards.items, c, 'awards.items'),
    },
    impact: {
      ...headingPair(impact, c, 'impact'),
      items: entryList(impact.items, c, 'impact.items'),
    },
    contact: {
      ...headingPair(contact, c, 'contact'),
      office: c.str(contact.office, 'contact.office', { max: 400 }),
    },
  };
}

/* ------------------------------------------------------- citation metrics */

export function validateMetrics(input: unknown): ValidationResult<MetricsContent> {
  const c = new Ctx();
  const root = asRecord(input);
  const source = asRecord(root.source);

  const lastUpdated = c.str(root.lastUpdated, 'lastUpdated', { required: true });
  if (lastUpdated && !/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) {
    c.fail('lastUpdated', 'must be formatted YYYY-MM-DD');
  }

  const value: MetricsContent = {
    totalCitations: c.str(root.totalCitations, 'totalCitations', { required: true, max: 20 }),
    hIndex: c.int(root.hIndex, 'hIndex', { min: 0, max: 500 }),
    source: {
      name: c.str(source.name, 'source.name', { required: true, max: 80 }),
      url: c.link(source.url, 'source.url') ?? '',
    },
    lastUpdated,
  };

  return c.issues.length ? { ok: false, issues: c.issues } : { ok: true, value };
}

/* ------------------------------------------------------------- entry point */

const VALIDATORS: {
  [K in ContentCollection]: (input: unknown, c: Ctx) => ContentMap[K];
} = {
  home: validateHome,
  members: validateMembers,
  projects: validateProjects,
  research: validateResearch,
  gallery: validateGallery,
  facilities: validateFacilities,
  about: validateAbout,
};

export function validateContent<K extends ContentCollection>(
  collection: K,
  input: unknown
): ValidationResult<ContentMap[K]> {
  if (!(CONTENT_COLLECTIONS as readonly string[]).includes(collection)) {
    return { ok: false, issues: [{ path: '', message: `unknown collection "${collection}"` }] };
  }
  const c = new Ctx();
  const value = VALIDATORS[collection](input, c);
  return c.issues.length ? { ok: false, issues: c.issues } : { ok: true, value };
}

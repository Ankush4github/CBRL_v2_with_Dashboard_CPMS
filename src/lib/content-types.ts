/**
 * Shapes of every editable content document under `content/`.
 *
 * Kept free of Node imports so client components (the dashboard forms, the
 * gallery grid) can import the types without dragging `fs` into the bundle.
 */

/* --------------------------------------------------------------- home page */

/** One background image of the hero carousel. */
export interface HeroSlide {
  src: string;
  alt: string;
}

/** Which of the two marquee rows a collaborator logo scrolls in. */
export type CollaboratorRow = 1 | 2;

export interface Collaborator {
  src: string;
  alt: string;
  /** Caption under the logo. */
  name: string;
  /** Rendered width in px. */
  width: number;
  /** True pixel dimensions of the source file, so the declared aspect ratio matches the image. */
  intrinsic: [number, number];
  /** Row 1 scrolls left, row 2 scrolls right. */
  row: CollaboratorRow;
  /** Optional institution website — the card becomes a link when set. */
  href?: string;
}

export interface HomeContent {
  hero: { slides: HeroSlide[] };
  collaborators: Collaborator[];
}

/* ------------------------------------------------------------------ members */

export const MEMBER_GROUPS = ['faculty', 'postdocs', 'students', 'staff', 'alumni'] as const;
export type MemberGroup = (typeof MEMBER_GROUPS)[number];

export const MEMBER_GROUP_LABELS: Record<MemberGroup, string> = {
  faculty: 'Faculty',
  postdocs: 'Postdoctoral Fellows',
  students: 'Research Scholars',
  staff: 'Staff',
  alumni: 'Alumni',
};

/** Profile links rendered as icons on the member cards. */
export const PROFILE_KEYS = ['googleScholar', 'orcid', 'linkedin', 'researchgate'] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export interface Member {
  /** Stable slug — also the `#anchor` the members page links to. */
  id: string;
  name: string;
  title: string;
  image?: string;
  bio?: string;
  research?: string;
  phone?: string;
  email: string;
  /** `YYYY-MM`. */
  joinedDate?: string;
  /** Blank-line separated `Degree: Institution` lines. */
  qualifications?: string;
  profiles?: Partial<Record<ProfileKey, string>>;
  responsibilities?: string;
  currentPosition?: string;
  thesisTitle?: string;
}

export type MembersContent = Record<MemberGroup, Member[]>;

/* ----------------------------------------------------------------- projects */

export interface Project {
  id: number;
  title: string;
  icon: string;
  shortDescription: string;
  /** `DD-MM-YYYY to DD-MM-YYYY`. */
  duration: string;
  funding: string;
  role: string;
  detailedDescription: string;
  objectives: string[];
  methodology: string;
  expectedOutcomes: string;
}

export interface Sponsor {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ProjectsContent {
  ongoing: Project[];
  completedPdf: string;
  sponsors: Sponsor[];
}

/* ----------------------------------------------------------------- research */

export interface ResearchTopic {
  id: string;
  title: string;
  summary: string;
  body: string[];
}

export interface ResearchArea {
  id: string;
  index: string;
  title: string;
  tagline: string;
  description: string;
  topics: ResearchTopic[];
}

export interface ResearchContent {
  areas: ResearchArea[];
}

/* ------------------------------------------------------------------ gallery */

export interface GalleryAlbum {
  id: number;
  title: string;
  caption: string;
  date: string;
  category: string;
  /** Cover image. */
  image: string;
  /** Lightbox images; falls back to the cover when empty. */
  images?: string[];
  description: string;
  likes: number;
  /** Renders the heart pre-filled on first paint. */
  isLiked: boolean;
}

export interface GalleryContent {
  categories: string[];
  albums: GalleryAlbum[];
}

/* --------------------------------------------------------------- facilities */

export interface InstrumentInCharge {
  name: string;
  title: string;
  email: string;
  /** `/members#slug`. */
  link: string;
}

export interface Instrument {
  title: string;
  subtitle?: string;
  imageSrc: string;
  imageAlt: string;
  features: string[];
  /** `Funder (ABBR) | Sanction Letter No: … | Date: …` — the part in
   *  parentheses becomes the filter chip. */
  fundingSource: string;
  inCharge: InstrumentInCharge;
}

export interface FacilityStat {
  value: string;
  label: string;
}

export interface ChargeTier {
  label: string;
  value: string;
}

export interface FacilityCharge {
  title: string;
  duration: string;
  prices: ChargeTier[];
}

export interface FacilitiesContent {
  stats: FacilityStat[];
  instruments: Instrument[];
  charges: FacilityCharge[];
  chargesNote: string;
}

/* ------------------------------------------------------- citation metrics */

export interface MetricsContent {
  totalCitations: string;
  hIndex: number;
  source: { name: string; url: string };
  /** `YYYY-MM-DD`. */
  lastUpdated: string;
}


/* ------------------------------------------------------------ about the PI */

/**
 * Token an editor can drop into any About-page string to have the live
 * publication count substituted at render time — the figure is derived from
 * the BibTeX record, so typing it by hand would go stale on every new paper.
 */
export const PUBLICATIONS_TOKEN = '{publications}';

/** Replace `{publications}` with the count the page was rendered with. */
export function fillAboutCounts(text: string, publications: number): string {
  return text.split(PUBLICATIONS_TOKEN).join(String(publications));
}

export interface AboutStat {
  /** Free text so `{publications}` and rounded figures like `20+` both work. */
  value: string;
  label: string;
}

/** One row of the Awards and Research impact lists. */
export interface AboutEntry {
  title: string;
  /** Optional — a bare title renders without the second line. */
  description: string;
}

/** Heading pair every band on the page shares. */
export interface AboutHeading {
  /** Small caps line above the heading. */
  eyebrow: string;
  heading: string;
}

export interface AboutContent {
  hero: {
    image: string;
    imageAlt: string;
    eyebrow: string;
    title: string;
    lead: string;
  };
  profile: {
    image: string;
    imageAlt: string;
    eyebrow: string;
    /** As displayed, honorifics included. */
    name: string;
    position: string;
    institution: string;
    /** Drives the Email button and the contact table. */
    email: string;
    /** Displayed as written; the `tel:` link is derived from the digits. */
    phone: string;
  };
  stats: AboutStat[];
  biography: AboutHeading & { paragraphs: string[] };
  awards: AboutHeading & { items: AboutEntry[] };
  impact: AboutHeading & { items: AboutEntry[] };
  contact: AboutHeading & {
    /** Postal address, one line per line break. */
    office: string;
  };
}
/* ------------------------------------------------------------- collections */

export const CONTENT_COLLECTIONS = [
  'home',
  'members',
  'projects',
  'research',
  'gallery',
  'facilities',
  'about',
] as const;

export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

export interface ContentMap {
  home: HomeContent;
  members: MembersContent;
  projects: ProjectsContent;
  research: ResearchContent;
  gallery: GalleryContent;
  facilities: FacilitiesContent;
  about: AboutContent;
}

export function isContentCollection(value: unknown): value is ContentCollection {
  return typeof value === 'string' && (CONTENT_COLLECTIONS as readonly string[]).includes(value);
}

/** Slug used for member anchors and generated image filenames. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

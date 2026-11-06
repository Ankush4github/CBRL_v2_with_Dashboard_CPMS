/**
 * Cross-links between the research, projects, publications and facilities
 * collections.
 *
 * None of those collections records which project belongs to which disease
 * topic, so the links are derived from wording the editors already wrote: a
 * topic is linked to a project or a paper only when the topic's own name (or
 * the acronym it gives in brackets) appears in that project's or paper's
 * title or summary. That is deliberately conservative — a missing link costs
 * a visitor one click, a wrong one misrepresents the lab's work — and the UI
 * labels these as "mentioning" the topic rather than as an official mapping.
 *
 * Client-safe: no Node imports.
 */

import type {
  ChargeTier,
  FacilityCharge,
  Instrument,
  Project,
  ResearchArea,
  ResearchTopic,
} from './content-types';
import { slugify } from './content-types';

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Phrases that identify a topic: its title without the bracketed acronym, and the acronym. */
export function topicKeys(topic: Pick<ResearchTopic, 'title'>): string[] {
  const title = topic.title.trim();
  const keys = new Set<string>();
  const acronym = /\(([^)]+)\)/.exec(title)?.[1]?.trim();
  const bare = title.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (bare) keys.add(bare.toLowerCase());
  if (acronym) {
    keys.add(acronym.toLowerCase());
    // "ILDs" → also match the singular "ILD".
    if (/^[A-Z]{2,}s$/.test(acronym)) keys.add(acronym.slice(0, -1).toLowerCase());
  }
  return [...keys].filter((k) => k.length >= 3);
}

export function mentionsTopic(topic: Pick<ResearchTopic, 'title'>, text: string): boolean {
  const haystack = text.toLowerCase().replace(/[–—]/g, '-');
  return topicKeys(topic).some((key) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(key)}([^a-z0-9]|$)`, 'i').test(haystack)
  );
}

export function projectText(project: Project): string {
  return `${project.title} ${project.shortDescription}`;
}

/** Broad vocabulary for each kind of area, used only to group projects for filtering. */
const AREA_VOCABULARY: Array<[RegExp, RegExp]> = [
  [/respir|lung|pulmon/i, /\b(lung|pulmonary|respiratory|copd|asthma|pneumonitis|silicosis)\b/i],
  [/women|reprod|gyn/i, /\b(pcos|polycystic|pregnan\w*|implantation|endometri\w*|gestational|reproductive|ivf)\b/i],
];

/** The research area a project belongs to, by its topics first and then by area vocabulary. */
export function projectArea(project: Project, areas: ResearchArea[]): ResearchArea | undefined {
  const text = projectText(project);
  const byTopic = areas.find((area) => area.topics.some((t) => mentionsTopic(t, text)));
  if (byTopic) return byTopic;
  return areas.find((area) =>
    AREA_VOCABULARY.some(([areaPattern, vocab]) => areaPattern.test(`${area.id} ${area.title}`) && vocab.test(text))
  );
}

/* ----------------------------------------------------------------- projects */

function parseDmy(s: string): Date | null {
  // Editors have written both 06-10-2023 and 01/10/2026.
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

/** `DD-MM-YYYY to DD-MM-YYYY` → dates, when the duration is written that way. */
export function projectPeriod(duration: string): { start: Date | null; end: Date | null } {
  const [a, b] = duration.split(/\s+to\s+/i);
  return { start: a ? parseDmy(a) : null, end: b ? parseDmy(b) : null };
}

export function formatPeriod(duration: string): string {
  const { start, end } = projectPeriod(duration);
  if (!start || !end) return duration;
  const f = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${f(start)} – ${f(end)}`;
}

/** The funder's abbreviation in brackets, or the whole name. */
export function funderShort(funding: string): string {
  const paren = /\(([^)]+)\)/.exec(funding);
  return paren ? paren[1].trim() : funding.trim();
}

export function projectAnchor(project: Pick<Project, 'id'>): string {
  return `project-${project.id}`;
}

/* --------------------------------------------------------------- facilities */

export function instrumentSlug(instrument: Pick<Instrument, 'title'>): string {
  return slugify(instrument.title.replace(/\(/g, ' ').replace(/\)/g, ' '));
}

/** Short funder label from `Funder (ABBR) | Sanction Letter …`. */
export function fundingLabel(fundingSource: string): string {
  const first = fundingSource.split('|')[0].trim();
  const paren = first.match(/\(([^)]+)\)/);
  return paren ? paren[1] : first;
}

function normaliseTitle(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The slot-charge row for an instrument, if the fee schedule lists one.
 *
 * The schedule and the catalogue are edited separately and their titles differ
 * in punctuation ("Molecular Spectroscopy(FTIR)" / "Molecular Spectroscopy
 * (FTIR)", "Zeta Potential Analyzer" / "Zeta Potential Analyzer / DLS"), so the
 * match ignores punctuation and accepts one title extending the other.
 */
export function chargeFor(
  instrument: Pick<Instrument, 'title'>,
  charges: FacilityCharge[]
): FacilityCharge | undefined {
  const a = normaliseTitle(instrument.title);
  if (!a) return undefined;
  return charges.find((c) => {
    const b = normaliseTitle(c.title);
    return b === a || b.startsWith(a) || a.startsWith(b);
  });
}

export type { ChargeTier };

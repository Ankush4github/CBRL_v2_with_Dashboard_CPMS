/**
 * Medicine-name checks for the scan review: suggestions from earlier records
 * and a "did you mean" for near misses. Pure, so it can be tested without the
 * page (scripts/test-scan-logic.mts).
 */

/** Spelling-insensitive key for a medicine name: "Tab. Pan-40" ~ "tab pan 40". */
export const normMedicineName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Levenshtein distance, stopping early once it exceeds `max`. */
export const editDistance = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

/**
 * Below this many distinct names, "not in earlier records" is true of nearly
 * everything and would teach staff to ignore it. Close-match suggestions still
 * show, since they are specific.
 */
export const MIN_NAMES_FOR_UNSEEN_FLAG = 25;

/**
 * Check one typed or read name against the known ones (normalised key ->
 * spelling). Nothing to say for a known name, a short one, or before any names
 * are loaded; otherwise the closest known spelling within about one edit per
 * five characters, or -- once enough names are known -- that it is unseen.
 */
export const matchMedicineName = (
  name: string,
  knownMedicines: Map<string, string> | null,
): { suggestion: string | null; unseen: boolean } => {
  const key = normMedicineName(name);
  if (!knownMedicines || knownMedicines.size === 0 || key.length < 3 || knownMedicines.has(key)) {
    return { suggestion: null, unseen: false };
  }
  // One edit per ~5 characters: "Paracetmol" finds "Paracetamol", but short
  // names don't match everything.
  const max = Math.min(3, Math.max(1, Math.floor(key.length / 5)));
  let best: string | null = null;
  let bestDistance = max + 1;
  for (const [known, spelling] of knownMedicines) {
    const d = editDistance(key, known, max);
    if (d < bestDistance) {
      bestDistance = d;
      best = spelling;
    }
  }
  return {
    suggestion: best,
    unseen: !best && knownMedicines.size >= MIN_NAMES_FOR_UNSEEN_FLAG,
  };
};

/**
 * The search box as a PostgREST or() filter over name, Patient ID and
 * reference. Values are double-quoted so commas and brackets cannot break the
 * filter syntax, and quotes and backslashes -- the quoting's own escape
 * characters -- are dropped. A typed % or _ stays an ILIKE wildcard, which can
 * only widen the match.
 */
export const searchFilter = (query: string): string | null => {
  const term = query.trim().replace(/["\\]/g, "");
  if (!term) return null;
  const pattern = `"%${term}%"`;
  return `patient_name.ilike.${pattern},patient_id.ilike.${pattern},reference_number.ilike.${pattern}`;
};

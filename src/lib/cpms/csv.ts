/**
 * CSV export helpers for the patient list. Pure, so they can be tested
 * (scripts/test-scan-logic.mts).
 */

// Each medicine with its dose, frequency and duration -- the export used to
// carry names only, which dropped the instructions a reader actually needs.
export const formatMedicines = (medicines: unknown): string => {
  if (!medicines) return "N/A";
  if (Array.isArray(medicines)) {
    return medicines
      .map((m: any) => {
        if (typeof m === "string") return m;
        const details = [m?.dosage, m?.frequency, m?.duration].filter(Boolean).join(", ");
        const name = m?.name || "Unnamed";
        return details ? `${name} (${details})` : name;
      })
      .join("; ");
  }
  return String(medicines);
};

export const escapeCSVField = (field: string): string => {
  // Spreadsheets run a cell starting with = + - @ (or tab/CR) as a formula:
  // "+ve" shows as #NAME?, and a crafted name or diagnosis could execute.
  // A leading apostrophe makes Excel and Sheets treat it as text.
  let value = field;
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

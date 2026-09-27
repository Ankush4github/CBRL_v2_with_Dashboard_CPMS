/**
 * Turning the model's reading of a prescription into the scan page's review
 * state. Pure functions, kept out of ScanPrescription.tsx so they can be
 * tested (scripts/test-scan-logic.mts) without React or Supabase.
 */

export interface ExtractedData {
  patient_name: string;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  hospital_name: string; // Note: bmi is computed via calculateBMI, not stored in ExtractedData
  doctor_name: string | null;
  diagnosis: string | null;
  /**
   * `_id` is client-side only and is stripped before saving. Confirmations are
   * keyed to it rather than to an array index: a tick belongs to a medicine,
   * not to a position, and keying by position meant every delete had to
   * renumber the whole confirmation set by hand -- correct only for a delete,
   * and silently wrong for an insert, a reorder or an undo.
   */
  medicines: Array<{ _id: string; name: string; dosage: string; frequency: string; duration: string; uncertain: string[] }>;
  visit_date: string | null;
  uhid: string | null;
  reference_number: string | null;
  confidence_score: number | null;
  /** Top-level fields the model said it could not read with certainty. Client-side
   *  only, like the medicines' `uncertain`; the raw copy keeps them for provenance. */
  uncertainFields: string[];
}

// Calculate BMI from height (cm) and weight (kg), rounded to 2 decimal places
export const calculateBMI = (heightCm: number | null, weightKg: number | null): number | null => {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
};

// The extraction prompt instructs the model to return null for anything it
// cannot read, so its response does not actually satisfy ExtractedData's
// non-null string fields. Spreading it in unchecked meant a prescription with,
// say, no duration on one medicine put null straight into a controlled input,
// which React warns about and which leaves the field unable to accept typing.
//
// Normalizing once here keeps that guarantee in one place instead of relying on
// a guard at every binding. Genuinely optional values stay null: the numeric
// inputs already guard them and the database wants null, not "", for an empty
// number or date.
export const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
};

export const asOptionalText = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

export const asOptionalNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

// The prompt asks for "M/F", but the review Select offers Male/Female/Other, so
// an unmapped "M" rendered as a blank Select and was saved as "M" regardless.
export const asGender = (value: unknown): string | null => {
  const text = asText(value).trim().toLowerCase();
  if (text === 'm' || text === 'male') return 'Male';
  if (text === 'f' || text === 'female') return 'Female';
  if (text === 'o' || text === 'other') return 'Other';
  return null;
};

export const localToday = (): string => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

// Only a real calendar date that is not in the future. Anything else ("26/09/26",
// "2026-02-30") showed as a blank date input while the raw string still went to
// the save; null instead raises the "no visit date" warning.
export const asVisitDate = (value: unknown): string | null => {
  const text = asText(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return text > localToday() ? null : text;
};

export const normalizeExtractedData = (raw: unknown, hospitalName: string): ExtractedData => {
  const source = (raw ?? {}) as Record<string, unknown>;
  const rawMedicines = Array.isArray(source.medicines) ? source.medicines : [];

  return {
    patient_name: asText(source.patient_name),
    age: asOptionalNumber(source.age),
    gender: asGender(source.gender),
    height_cm: asOptionalNumber(source.height_cm),
    weight_kg: asOptionalNumber(source.weight_kg),
    hospital_name: hospitalName,
    doctor_name: asOptionalText(source.doctor_name),
    diagnosis: asOptionalText(source.diagnosis),
    medicines: rawMedicines.map((medicine) => {
      const med = (medicine ?? {}) as Record<string, unknown>;
      return {
        _id: crypto.randomUUID(),
        name: asText(med.name),
        dosage: asText(med.dosage),
        frequency: asText(med.frequency),
        duration: asText(med.duration),
        uncertain: asStringList(med.uncertain),
      };
    }),
    visit_date: asVisitDate(source.visit_date),
    uhid: asOptionalText(source.uhid),
    reference_number: asOptionalText(source.reference_number),
    confidence_score: asOptionalNumber(source.confidence_score),
    uncertainFields: asStringList(source.uncertain_fields),
  };
};

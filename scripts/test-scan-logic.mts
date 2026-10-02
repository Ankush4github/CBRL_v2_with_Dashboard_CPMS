// Checks for the prescription-scan and patient-record helpers: how the AI's
// reading becomes review state, the medicine-name matcher, the photo quality
// check, CSV export, the patient search filter, and PDF text handling.
//
// All of these are pure functions, so they are called directly -- no browser,
// Supabase or Gemini involved.
//
//   npx tsx scripts/test-scan-logic.mts
//
import {
  asGender,
  asVisitDate,
  calculateBMI,
  localToday,
  normalizeExtractedData,
} from '../src/lib/cpms/scan-reading.ts';
import { MIN_NAMES_FOR_UNSEEN_FLAG, matchMedicineName, normMedicineName } from '../src/lib/cpms/medicine-names.ts';
import { assessGray, qualityWarning } from '../src/lib/cpms/image-quality.ts';
import { escapeCSVField, formatMedicines } from '../src/lib/cpms/csv.ts';
import { searchFilter } from '../src/lib/cpms/patient-search.ts';
import { pdfSafeText, wrapText } from '../supabase/functions/generate-patient-pdf/text.ts';
import { coverTransform, guideRect, guideToFrameCrop, SCAN_ASPECT } from '../src/lib/cpms/scan-geometry.ts';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

// ------------------------------------------------------------ gender
// The prompt asks the model for M/F; the review Select only has full words.
check('gender M', asGender('M'), 'Male');
check('gender f', asGender('f'), 'Female');
check('gender padded word', asGender('  Female '), 'Female');
check('gender other', asGender('O'), 'Other');
check('gender unknown', asGender('x'), null);
check('gender null', asGender(null), null);

// ------------------------------------------------------------ visit date
const today = localToday();
const [ty, tm, td] = today.split('-').map(Number);
const tomorrowDate = new Date(ty, tm - 1, td + 1);
const tomorrow = [
  tomorrowDate.getFullYear(),
  String(tomorrowDate.getMonth() + 1).padStart(2, '0'),
  String(tomorrowDate.getDate()).padStart(2, '0'),
].join('-');

check('date valid', asVisitDate('2026-09-01'), '2026-09-01');
check('date today allowed', asVisitDate(today), today);
check('date tomorrow refused', asVisitDate(tomorrow), null);
check('date impossible day', asVisitDate('2026-02-30'), null);
check('date Indian format refused', asVisitDate('26/09/2026'), null);
check('date two-digit year', asVisitDate('26-09-26'), null);
check('date junk', asVisitDate('yesterday'), null);
check('date padded', asVisitDate(' 2026-09-01 '), '2026-09-01');

// ------------------------------------------------------------ BMI
check('bmi', calculateBMI(170, 65), 22.49);
check('bmi missing height', calculateBMI(null, 65), null);
check('bmi zero weight', calculateBMI(170, 0), null);

// ------------------------------------------------------------ whole reading
const reading = normalizeExtractedData(
  {
    patient_name: null,
    age: '45 yrs',
    gender: 'F',
    height_cm: '160 cm',
    weight_kg: 58,
    doctor_name: '  ',
    diagnosis: 'Viral fever',
    visit_date: '26/09/2026',
    uhid: 'UH123',
    confidence_score: '85',
    uncertain_fields: ['age', 7, 'visit_date'],
    medicines: [
      { name: 'Paracetamol', dosage: '650mg', frequency: '1-0-1', duration: null, uncertain: ['dosage', null] },
      'not an object',
      null,
    ],
  },
  'CBRL',
);
check('reading name null becomes empty text', reading.patient_name, '');
check('reading age parsed', reading.age, 45);
check('reading gender mapped', reading.gender, 'Female');
check('reading height parsed', reading.height_cm, 160);
check('reading blank doctor is null', reading.doctor_name, null);
check('reading bad date dropped', reading.visit_date, null);
check('reading hospital from operator', reading.hospital_name, 'CBRL');
check('reading confidence parsed', reading.confidence_score, 85);
check('reading unclear fields strings only', reading.uncertainFields, ['age', 'visit_date']);
check('reading medicine count', reading.medicines.length, 3);
check('reading medicine null duration', reading.medicines[0].duration, '');
check('reading medicine unclear parts', reading.medicines[0].uncertain, ['dosage']);
check('reading medicine from a string row', reading.medicines[1].name, '');
check('reading medicine ids unique', new Set(reading.medicines.map((m) => m._id)).size, 3);
check('reading from garbage', normalizeExtractedData('nonsense', 'CBRL').medicines, []);

// ------------------------------------------------------------ medicine names
check('norm ignores punctuation and case', normMedicineName('Tab. Pan-40'), normMedicineName('tab pan 40'));

const known = new Map(
  ['Paracetamol 500mg', 'Tab. Pan-40', 'Azithromycin', 'Metformin', 'Amlodipine'].map((n) => [normMedicineName(n), n]),
);
check('match known, reformatted', matchMedicineName('tab pan 40', known), { suggestion: null, unseen: false });
check('match typo', matchMedicineName('Paracetmol 500mg', known).suggestion, 'Paracetamol 500mg');
check('match typo 2', matchMedicineName('Azithromicin', known).suggestion, 'Azithromycin');
check('match typo 3', matchMedicineName('Amlodepine', known).suggestion, 'Amlodipine');
check('no false match', matchMedicineName('Aspirin', known), { suggestion: null, unseen: false });
check('short names left alone', matchMedicineName('Pa', known), { suggestion: null, unseen: false });
check('nothing loaded yet', matchMedicineName('Aspirin', null), { suggestion: null, unseen: false });

// "Not in earlier records" only once there are enough names for it to mean something.
const many = new Map(known);
for (let i = 0; many.size < MIN_NAMES_FOR_UNSEEN_FLAG; i++) many.set(`zzdrug${i}`, `ZZ Drug ${i}`);
check('unseen flagged with enough names', matchMedicineName('Aspirin', many).unseen, true);
check('unseen not flagged with few names', matchMedicineName('Aspirin', known).unseen, false);

// ------------------------------------------------------------ photo quality
const W = 512, H = 360;
function page(density: number, ink = 30, paper = 225) {
  const g = new Uint8ClampedArray(W * H).fill(paper);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let row = 20; row < H - 20; row += 22)
    for (let x = 20; x < W - 20; x++)
      if (rnd() < density)
        for (let dy = 0; dy < 10; dy++)
          if (rnd() < 0.5) { g[(row + dy) * W + x] = ink; g[(row + dy) * W + x + 1] = ink; }
  return g;
}
function blur(src: Uint8ClampedArray, r: number) {
  let a = src;
  for (let pass = 0; pass < 3; pass++) {
    const b = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { sum += a[y * W + xx]; n++; } }
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { sum += a[yy * W + x]; n++; } }
      b[y * W + x] = sum / n;
    }
    a = b;
  }
  return a;
}
const sparse = page(0.07, 40, 215);
const quality = (g: Uint8ClampedArray) => {
  const q = assessGray(g, W, H);
  return q.dark ? 'dark' : q.blurry ? 'blurry' : 'ok';
};
check('photo sharp handwriting', quality(sparse), 'ok');
check('photo sharp dense print', quality(page(0.35)), 'ok');
check('photo slightly soft is fine', quality(blur(sparse, 1)), 'ok');
check('photo blurred handwriting', quality(blur(sparse, 2)), 'blurry');
check('photo very blurred', quality(blur(sparse, 4)), 'blurry');
check('photo dark', quality(page(0.35).map((v) => v * 0.2) as Uint8ClampedArray), 'dark');
check('photo dim but readable', quality(page(0.35).map((v) => v * 0.45) as Uint8ClampedArray), 'ok');
check('warning only when needed', qualityWarning(assessGray(sparse, W, H)), null);
check('no warning when check failed', qualityWarning(null), null);

// ------------------------------------------------------------ CSV
check('csv plain', escapeCSVField('Normal'), 'Normal');
check('csv comma quoted', escapeCSVField('Fever, cough'), '"Fever, cough"');
check('csv quotes doubled', escapeCSVField('say "hi"'), '"say ""hi"""');
check('csv newline quoted', escapeCSVField('a\nb'), '"a\nb"');
check('csv +ve not a formula', escapeCSVField('+ve'), "'+ve");
check('csv -ve not a formula', escapeCSVField('-ve for HBsAg'), "'-ve for HBsAg");
check('csv @ not a formula', escapeCSVField('@SUM(A1)'), "'@SUM(A1)");
check('csv formula with quotes', escapeCSVField('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
check('csv medicines full', formatMedicines([
  { name: 'Paracetamol', dosage: '650mg', frequency: '1-0-1', duration: '5 days' },
  { name: 'ORS' },
  'Vitamin C',
]), 'Paracetamol (650mg, 1-0-1, 5 days); ORS; Vitamin C');
check('csv medicines none', formatMedicines(null), 'N/A');

// ------------------------------------------------------------ patient search
check('search empty', searchFilter('   '), null);
check('search plain', searchFilter('amit'),
  'patient_name.ilike."%amit%",patient_id.ilike."%amit%",reference_number.ilike."%amit%"');
check('search keeps commas inside quotes', (searchFilter('Das, Amit') ?? '').split('",').length, 3);
check('search drops quotes and backslashes', searchFilter('we"ird\\x'),
  'patient_name.ilike."%weirdx%",patient_id.ilike."%weirdx%",reference_number.ilike."%weirdx%"');

// ------------------------------------------------------------ PDF text
// A stand-in font: every character is half the font size wide.
const font = { widthOfTextAtSize: (s: string, size: number) => [...s].length * size * 0.5 };
check('wrap keeps line breaks', wrapText('Fever\n+ve NS1', 1000, font, 10), ['Fever', '+ve NS1']);
check('wrap keeps blank lines, drops trailing', wrapText('a\n\nb\n\n', 1000, font, 10), ['a', '', 'b']);
// 50pt at 5pt a character is 10 characters; "three four" fits exactly.
check('wrap by width', wrapText('one two three four', 50, font, 10), ['one two', 'three four']);
check('wrap one over the width', wrapText('one two three fours', 50, font, 10), ['one two', 'three', 'fours']);
check('wrap breaks a long word', wrapText('abcdefghijkl', 30, font, 10), ['abcdef', 'ghijkl']);
check('wrap empty', wrapText('', 100, font, 10), ['']);

// Printable ASCII plus a few symbols Noto Sans has; nothing else.
const charset = new Set<number>([...Array(95)].map((_, i) => 32 + i).concat([0x20b9, 0x2013, 0x201c, 0x201d]));
check('pdf keeps supported text', pdfSafeText(charset, 'Fee ₹500 “ok”'), 'Fee ₹500 “ok”');
check('pdf Bengali becomes a note', pdfSafeText(charset, 'অমিত কুমার দাস (Amit)'),
  '[Bengali text – see the record in CPMS] (Amit)');
check('pdf Devanagari becomes a note', pdfSafeText(charset, 'राजेश'), '[Devanagari text – see the record in CPMS]');
check('pdf arrow fallback', pdfSafeText(charset, 'A → B ≥ C'), 'A -> B >= C');
check('pdf unknown becomes ?', pdfSafeText(charset, 'ok 😀'), 'ok ?');
check('pdf keeps newlines', pdfSafeText(charset, 'a\nb'), 'a\nb');

// ------------------------------------------------------------ scan geometry
// The viewfinder's guide is laid out in stage (CSS) pixels and the crop is cut
// in camera-frame pixels. For every screen shape and frame shape, the crop has
// to land exactly on what the guide showed: map it back through the cover
// transform and it must reproduce the guide.
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const stages: Array<[string, number, number]> = [
  ['small Android portrait', 360, 520],
  ['large Android portrait', 412, 700],
  ['iPhone portrait', 390, 610],
  ['short viewport (browser bar shown)', 390, 420],
  ['landscape phone', 780, 250],
  ['tablet portrait', 768, 860],
];
const frames: Array<[string, number, number]> = [
  ['portrait 5:7 frame', 1440, 2016],
  ['portrait 9:16 frame', 1080, 1920],
  ['landscape 16:9 frame', 1920, 1080],
  ['landscape 4:3 frame', 1280, 960],
];
for (const [stageName, sw, sh] of stages) {
  const g = guideRect(sw, sh);
  check(`guide is 5:7 (${stageName})`, near(g.width / g.height, SCAN_ASPECT), true);
  check(`guide inside stage (${stageName})`,
    g.x >= 0 && g.y >= 0 && g.x + g.width <= sw && g.y + g.height <= sh, true);
  check(`guide centred (${stageName})`,
    near(g.x, sw - g.x - g.width) && near(g.y, sh - g.y - g.height), true);
  check(`guide within 86% wide / 90% tall (${stageName})`,
    g.width <= sw * 0.86 + 1e-9 && g.height <= sh * 0.9 + 1e-9, true);

  for (const [frameName, fw, fh] of frames) {
    const label = `${stageName}, ${frameName}`;
    const crop = guideToFrameCrop(g, sw, sh, fw, fh);
    const t = coverTransform(sw, sh, fw, fh);
    check(`crop inside frame (${label})`,
      crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= fw + 1e-9 && crop.y + crop.height <= fh + 1e-9, true);
    check(`crop is 5:7, unstretched (${label})`, near(crop.width / crop.height, SCAN_ASPECT), true);
    // Back to the screen: frame px * scale + offset.
    const back = {
      x: crop.x * t.scale + t.offsetX,
      y: crop.y * t.scale + t.offsetY,
      width: crop.width * t.scale,
      height: crop.height * t.scale,
    };
    check(`crop maps back onto the guide (${label})`,
      near(back.x, g.x) && near(back.y, g.y) && near(back.width, g.width) && near(back.height, g.height), true);
  }
}
// Portrait phones are limited by width: the guide uses 86% of it.
check('portrait guide is 86% of the width', near(guideRect(412, 700).width, 412 * 0.86), true);
// The cover transform fills the stage on both axes and overflows one.
{
  const t = coverTransform(390, 610, 1920, 1080);
  check('cover fills the stage height', near(1080 * t.scale, 610), true);
  check('cover overflows the width, centred', near(t.offsetX, (390 - 1920 * t.scale) / 2) && t.offsetX < 0, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

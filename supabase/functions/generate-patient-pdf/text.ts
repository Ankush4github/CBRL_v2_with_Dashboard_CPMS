// Text handling for the patient PDF: what the font can draw, and how it wraps.
// No imports, so Node can load it for scripts/test-scan-logic.mts as well as
// the Edge Function.

/**
 * Lines of at most `maxWidth`, keeping the text's own line breaks.
 *
 * It used to split on spaces only: a diagnosis typed over several lines kept
 * its newlines inside one "line", and pdf-lib drew those as extra lines on top
 * of the section below. A single word wider than the page is broken by
 * characters rather than left to run off the edge. Pass text through
 * pdfSafeText() first; this only measures.
 */
export function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const lines: string[] = [];
  const fits = (s: string) => font.widthOfTextAtSize(s, fontSize) <= maxWidth;

  for (const paragraph of text.split(/\r?\n/)) {
    let currentLine = "";
    for (const rawWord of paragraph.split(/[ \t]+/).filter(Boolean)) {
      let word = rawWord;
      while (!fits(word)) {
        let cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut))) cut--;
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (currentLine && !fits(testLine)) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
  }

  // Blank paragraphs survive as blank lines, but not trailing ones.
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Indian scripts, by block. pdf-lib's shaping reorders their vowel signs
 * wrongly ("অমিত" is drawn as "অ ি মত"), and a patient's name drawn wrongly on
 * an audit document is worse than one not drawn, so such runs become a note.
 */
const INDIC_SCRIPTS: Array<[number, number, string]> = [
  [0x0900, 0x097f, "Devanagari"],
  [0x0980, 0x09ff, "Bengali"],
  [0x0a00, 0x0a7f, "Gurmukhi"],
  [0x0a80, 0x0aff, "Gujarati"],
  [0x0b00, 0x0b7f, "Odia"],
  [0x0b80, 0x0bff, "Tamil"],
  [0x0c00, 0x0c7f, "Telugu"],
  [0x0c80, 0x0cff, "Kannada"],
  [0x0d00, 0x0d7f, "Malayalam"],
];
const INDIC_RUN = /[ऀ-ൿ]+(?:[\s‌‍]+[ऀ-ൿ]+)*/g;

/** Plain stand-ins for common symbols Noto Sans (or Helvetica) may lack. */
const SYMBOL_FALLBACKS: Record<string, string> = {
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>",
  "≥": ">=", "≤": "<=", "≠": "!=", "×": "x",
  "…": "...", "−": "-", "‑": "-", " ": " ",
};

/**
 * Text the given font can actually draw. pdf-lib throws on the first character
 * outside a font's set ("WinAnsi cannot encode"), which used to fail the whole
 * export with a 500. Indian-script runs become a note (see INDIC_SCRIPTS),
 * known symbols get a plain stand-in, and anything else becomes "?".
 */
export function pdfSafeText(charset: Set<number>, text: string): string {
  const withNotes = text.replace(INDIC_RUN, (run) => {
    const cp = run.codePointAt(0) ?? 0;
    const script = INDIC_SCRIPTS.find(([lo, hi]) => cp >= lo && cp <= hi)?.[2] ?? "Indian-script";
    return `[${script} text – see the record in CPMS]`;
  });
  let out = "";
  for (const ch of withNotes) {
    if (ch === "\n" || ch === "\r") {
      out += ch;
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if (charset.has(cp)) {
      out += ch;
      continue;
    }
    const fallback = SYMBOL_FALLBACKS[ch];
    out += fallback && [...fallback].every((c) => charset.has(c.codePointAt(0)!)) ? fallback : "?";
  }
  return out;
}

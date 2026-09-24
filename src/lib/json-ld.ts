/**
 * Serialise structured data for a `<script type="application/ld+json">` body.
 *
 * JSON.stringify leaves `<` alone, so an editor-controlled string containing
 * `</script>` would close the tag and let what follows run as script (the CSP
 * allows inline scripts). Escaping `<`, `>` and `&` as \u sequences keeps the
 * JSON identical to a parser while nothing in it can end the tag. The line and
 * paragraph separators (U+2028, U+2029) are escaped too, since some script
 * parsers treat them as line breaks.
 */
const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  [String.fromCharCode(0x2028)]: '\\u2028',
  [String.fromCharCode(0x2029)]: '\\u2029',
};

const UNSAFE = new RegExp(`[${Object.keys(ESCAPES).join('')}]`, 'g');

export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (ch) => ESCAPES[ch]);
}

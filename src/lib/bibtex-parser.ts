import { splitEntries } from './bibtex-entries';

export interface Publication {
  type: string;
  citationKey: string;
  title: string;
  author: string;
  journal?: string;
  year: number;
  doi?: string;
  volume?: string;
  number?: string;
  pages?: string;
  booktitle?: string;
  publisher?: string;
  editor?: string;
  chapter?: string;
  isbn?: string;
}

const LATEX_COMMANDS: Record<string, string> = {
  textendash: '–',
  textemdash: '—',
  textdagger: '†',
  textdaggerdbl: '‡',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', kappa: 'κ',
  lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Psi: 'Ψ', Omega: 'Ω',
};

// Accent commands (\'o, \"{u}, …) as combining marks, composed by normalize().
const LATEX_ACCENTS: Record<string, string> = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', c: '̧',
};

/** Turn a raw BibTeX field value into display text. */
function cleanValue(value: string): string {
  return value
    .replace(/\\([`'^"~c])\s*\{?([a-zA-Z])\}?/g, (m, accent: string, letter: string) =>
      accent in LATEX_ACCENTS ? letter + LATEX_ACCENTS[accent] : m)
    .replace(/\\([a-zA-Z]+)\b\s*/g, (m, name: string) => LATEX_COMMANDS[name] ?? m)
    .replace(/\\([&%_#$])/g, '$1')
    // Math delimiters around what the commands above already converted.
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .normalize('NFC')
    .trim();
}

export function parseBibTeX(bibtex: string): Publication[] {
  const publications: Publication[] = [];

  // splitEntries tracks brace depth, so values with nested braces
  // ("Da {Doma Sherpa} and …", "N{\'o}ra") are read whole.
  splitEntries(bibtex).forEach(entry => {
    const type = entry.type;
    const citationKey = entry.key;

    const fields: Record<string, string> = {};
    for (const field of entry.fields) {
      const value = cleanValue(field.value);
      if (value) fields[field.name] = value;
    }

    // Create publication object with all possible fields
    const publication: Publication = {
      type: type.toLowerCase(),
      citationKey,
      title: fields.title || '',
      author: fields.author || '',
      year: parseInt(fields.year || '0', 10),
    };

    // Add optional fields based on publication type
    if (type.toLowerCase() === 'article') {
      publication.journal = fields.journal;
      publication.volume = fields.volume;
      publication.number = fields.number;
    } else if (['inbook', 'incollection', 'chapter', 'inproceedings'].includes(type.toLowerCase())) {
      publication.booktitle = fields.booktitle;
      publication.publisher = fields.publisher;
      publication.editor = fields.editor;
      publication.chapter = fields.chapter;
      publication.isbn = fields.isbn;
    }

    // Common optional fields
    if (fields.doi) {
      // Clean DOI to remove URL prefix if present
      publication.doi = fields.doi.replace(/https?:\/\/(?:dx\.)?doi\.org\//i, '');
    }
    if (fields.pages) publication.pages = fields.pages;

    publications.push(publication);
  });

  // Sort publications by year (newest first)
  return publications.sort((a, b) => b.year - a.year);
}

export function formatAuthors(authorString: string): string {
  if (!authorString) return '';

  return authorString
    .split(/\s+and\s+/)
    .map(author => {
      // Handle different name formats
      const parts = author.split(',');
      if (parts.length > 1) {
        // "Lastname, Firstname" format -> convert to "Firstname Lastname"
        const lastName = parts[0].trim();
        const firstName = parts[1].trim();
        return `${firstName} ${lastName}`;
      } else {
        // "Firstname Lastname" format - keep as is
        return author.trim();
      }
    })
    .join(', ');
}

export function formatEditors(editorString: string): string {
  if (!editorString) return '';
  return formatAuthors(editorString);
}
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

export function parseBibTeX(bibtex: string): Publication[] {
  const publications: Publication[] = [];
  const entries = bibtex.split(/(?=@)/);

  entries.forEach(entry => {
    if (!entry.trim()) return;

    // Extract entry type and citation key
    const typeMatch = entry.match(/@(\w+)\s*{\s*([^,]+),/);
    if (!typeMatch) return;

    const [, type, citationKey] = typeMatch;

    // Extract fields using a more robust approach
    const fields: Record<string, string> = {};
    // Updated regex to handle more field formats
    const fieldRegex = /(\w+)\s*=\s*(?:{([^}]*)}|"([^"]*)"|(\d+))/g;
    let match;

    while ((match = fieldRegex.exec(entry)) !== null) {
      const [, field, value1, value2, value3] = match;
      // Use the first non-undefined value
      const value = value1 || value2 || value3;
      if (!value) continue;

      // Clean and normalize the value
      const cleanValue = value
        .trim()
        // Remove nested braces
        .replace(/^{+|}+$/g, '')
        // Handle special characters
        .replace(/[{}\\]/g, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Handle LaTeX special characters
        .replace(/\$\\[a-zA-Z]+\$/g, '')
        .trim();

      fields[field.toLowerCase()] = cleanValue;
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
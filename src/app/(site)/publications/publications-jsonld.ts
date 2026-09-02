import { type Publication } from '@/lib/bibtex-parser';

const PAGE_URL = 'https://cbrl.iitkgp.ac.in/publications';

const CHAPTER_TYPES = new Set(['inbook', 'incollection']);

/**
 * BibTeX keeps every author in one string ("Lastname, F. and Other, A."), while
 * schema.org wants a node per person. Names already in "Firstname Lastname"
 * order have no comma and pass through untouched.
 */
function toPersonNodes(authorField: string) {
  return authorField
    .split(/\s+and\s+/)
    .map((entry) => {
      const [last, first] = entry.split(',');
      return first ? `${first.trim()} ${last.trim()}` : entry.trim();
    })
    .filter(Boolean)
    .map((name) => ({ '@type': 'Person', name }));
}

function toWorkNode(publication: Publication) {
  const { type, title, author, year, doi, journal, volume, pages, booktitle, publisher, isbn } =
    publication;

  const schemaType = CHAPTER_TYPES.has(type)
    ? 'Chapter'
    : type === 'book'
      ? 'Book'
      : 'ScholarlyArticle';

  const node: Record<string, unknown> = { '@type': schemaType, name: title };

  // Google's Article documentation keys off `headline`, so the article-shaped
  // entries carry both.
  if (schemaType === 'ScholarlyArticle') node.headline = title;

  const authors = toPersonNodes(author);
  if (authors.length) node.author = authors;
  if (year > 0) node.datePublished = String(year);
  if (pages) node.pagination = pages;

  if (doi) {
    node.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: doi };
    node.url = `https://doi.org/${doi}`;
  }

  if (journal) {
    const periodical = { '@type': 'Periodical', name: journal };
    node.isPartOf = volume
      ? { '@type': 'PublicationVolume', volumeNumber: volume, isPartOf: periodical }
      : periodical;
  } else if (booktitle) {
    const book: Record<string, unknown> = { '@type': 'Book', name: booktitle };
    if (isbn) book.isbn = isbn;
    if (publisher) book.publisher = { '@type': 'Organization', name: publisher };
    node.isPartOf = book;
  } else if (publisher) {
    node.publisher = { '@type': 'Organization', name: publisher };
  }

  return node;
}

/**
 * Describes every parsed publication as a schema.org work. The page renders the
 * same list as text, but only the structured form carries the DOI, journal and
 * author breakdown in a way a crawler can attribute to the lab.
 */
export function generatePublicationsJsonLd(publications: Publication[]) {
  // A work with no title or no author is not something the lab can be credited
  // with — BibTeX exports pick up journal front matter such as "Author Index
  // Vol. 69, 2010", which carries an empty author field.
  const credited = publications.filter(
    (publication) => publication.title && publication.author.trim()
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'CBRL Publications',
    description:
      'Peer-reviewed journal articles, book chapters and conference papers from the Clinical Biomarker Research Laboratory, IIT Kharagpur.',
    url: PAGE_URL,
    numberOfItems: credited.length,
    // parseBibTeX sorts newest first.
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: credited.map((publication, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: toWorkNode(publication),
    })),
  };
}

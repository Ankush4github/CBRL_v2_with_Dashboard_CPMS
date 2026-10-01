/**
 * Deletes a publication. A POST twin of `DELETE ../`, because CIC's Apache in
 * front of the site refuses the DELETE method before it reaches Node.
 */
export { DELETE as POST } from '../route';

// Next reads these per file and only as literals, so they cannot be re-exported.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

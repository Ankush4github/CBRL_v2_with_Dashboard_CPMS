import { MetadataRoute } from 'next';

const baseUrl = 'https://cbrl.iitkgp.ac.in';

// Static dates, not `new Date()` — a build-time timestamp claims every page
// changed on every deploy, and crawlers learn to ignore a lastmod that always
// moves. Bump a route's date when its content actually changes.
//
// changefreq and priority are deliberately omitted: Google ignores both
// outright, so they only add noise a maintainer has to keep plausible.
const routes: { path: string; lastModified: string }[] = [
        { path: '', lastModified: '2026-07-21' },
        { path: '/about-the-pi', lastModified: '2026-07-21' },
        { path: '/research', lastModified: '2026-07-21' },
        { path: '/projects', lastModified: '2026-07-21' },
        { path: '/publications', lastModified: '2026-07-21' },
        { path: '/facilities', lastModified: '2026-07-21' },
        { path: '/members', lastModified: '2026-07-21' },
        { path: '/gallery', lastModified: '2026-07-21' },
        { path: '/contact', lastModified: '2026-07-21' },
    ];

export default function sitemap(): MetadataRoute.Sitemap {
    return routes.map(({ path, lastModified }) => ({
        url: `${baseUrl}${path}`,
        lastModified: new Date(lastModified),
    }));
}

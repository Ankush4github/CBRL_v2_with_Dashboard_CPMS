import { MetadataRoute } from 'next';

/**
 * Paths kept out of search results.
 *
 * /cpms is the patient management app, a route subtree of this one
 * (src/app/cpms). It is staff-only, reached by direct URL, and deliberately
 * absent from the nav and the sitemap; there is nothing there for a crawler but
 * a login screen.
 *
 * Repeated into *every* group below, not just '*'. A crawler obeys the single
 * most specific group that names it and ignores all the others, so a Disallow
 * living only under '*' would be invisible to Googlebot, Bingbot, GPTBot and
 * every other agent named here — the ones that actually matter.
 *
 * Note this blocks crawling, not indexing: a disallowed URL can still surface as
 * a bare link if something external points at it. Nothing does today. Ruling it
 * out entirely would mean allowing the crawl and serving X-Robots-Tag: noindex
 * from the /cpms header block in next.config.js instead — the two mechanisms are
 * mutually exclusive, since a crawler that is not allowed to fetch the URL never
 * sees the header.
 */
const disallow = ['/cpms'];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/_next/static/'],
                disallow,
            },
            // Google Search and AI
            {
                userAgent: 'Googlebot',
                allow: '/',
                disallow,
            },
            {
                userAgent: 'Googlebot-Image',
                allow: '/',
                disallow,
            },
            {
                userAgent: 'Google-Extended',
                allow: '/',
                disallow,
            },
            // Bing and Microsoft AI
            {
                userAgent: 'Bingbot',
                allow: '/',
                disallow,
            },
            // OpenAI/ChatGPT
            {
                userAgent: 'GPTBot',
                allow: '/',
                disallow,
            },
            {
                userAgent: 'ChatGPT-User',
                allow: '/',
                disallow,
            },
            // Anthropic Claude
            {
                userAgent: 'anthropic-ai',
                allow: '/',
                disallow,
            },
            {
                userAgent: 'Claude-Web',
                allow: '/',
                disallow,
            },
            // Perplexity
            {
                userAgent: 'PerplexityBot',
                allow: '/',
                disallow,
            },
            // Other AI assistants
            {
                userAgent: 'Applebot',
                allow: '/',
                disallow,
            },
            {
                userAgent: 'Applebot-Extended',
                allow: '/',
                disallow,
            },
        ],
        sitemap: 'https://cbrl.iitkgp.ac.in/sitemap.xml',
        host: 'https://cbrl.iitkgp.ac.in',
    };
}

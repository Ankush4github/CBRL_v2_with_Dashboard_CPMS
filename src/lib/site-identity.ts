/**
 * Who this website is, for search engines: one source for every name, URL and
 * structured-data @id the public site emits.
 *
 * Google chooses the site name shown above a result from several signals --
 * the WebSite structured data first, then og:site_name, the <title> and the
 * page headings -- and falls back to the parent domain's name when those
 * disagree. cbrl.iitkgp.ac.in is a subdomain, so an inconsistent signal lets
 * "Indian Institute of Technology Kharagpur | IIT KGP" (iitkgp.ac.in's own
 * name) win. Every page therefore says the same thing: this site is the
 * Clinical Biomarker Research Laboratory (CBRL), a laboratory of IIT
 * Kharagpur. None of this guarantees what Google displays; it removes the
 * ambiguity.
 *
 * The lab and the site are each defined once, in the (site) layout, with the
 * @ids below. Other pages refer to them by @id instead of repeating them, so
 * there is exactly one WebSite and one Organization for Google to read.
 */

import { SITE_URL as ORIGIN } from './site-url';

/** The homepage exactly as canonicalised -- the origin with its trailing slash. */
export const HOME_URL = `${ORIGIN}/`;
export const SITE_NAME = 'Clinical Biomarker Research Laboratory';
export const SITE_SHORT_NAME = 'CBRL';
export const SITE_TITLE = `${SITE_NAME} | IIT Kharagpur`;

export const WEBSITE_ID = `${HOME_URL}#website`;
export const ORGANIZATION_ID = `${HOME_URL}#organization`;

export const LOGO_URL = `${HOME_URL}cbrl-logo.png`;

export const PARENT_ORGANIZATION = {
  '@type': 'CollegeOrUniversity',
  name: 'Indian Institute of Technology Kharagpur',
  alternateName: 'IIT Kharagpur',
  url: 'https://www.iitkgp.ac.in/',
  sameAs: 'https://en.wikipedia.org/wiki/IIT_Kharagpur',
} as const;

/** A reference to the one WebSite node, for isPartOf. */
export const websiteRef = { '@id': WEBSITE_ID } as const;

/** A reference to the one Organization node, for worksFor, publisher, about. */
export const organizationRef = { '@id': ORGANIZATION_ID } as const;

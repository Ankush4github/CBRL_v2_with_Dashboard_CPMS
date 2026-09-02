// CPMS lives at /cpms in this app's own route tree (src/app/cpms). It used to be
// a second Next process on :8080 that this config proxied to; that process is
// gone, along with the basePath and the rewrite that reached it. What it still
// needs from here is its own header block below — its security posture differs
// from the site's and cannot be served by one policy.

// The Supabase project backing the content dashboard — sign-in, the site_content
// table, the site-media image bucket — and CPMS. This app holds only the
// publishable key; see src/lib/supabase/config.ts for why a service-role key
// must never appear.
//
// Read straight from the environment now. These two values used to live in
// .env.shared and be loaded by shared-env.cjs, because Next reads .env files
// only from its own project root and there were two roots to feed. One root,
// one .env.local, no indirection.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_HOST = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin requests from IIT Kharagpur domains and local network
  allowedDevOrigins: [
    'testsite2.iitkgp.ac.in',
    'cbrl.iitkgp.ac.in',
    '10.111.4.13',
  ],
  images: {
    unoptimized: false,
    qualities: [60, 75, 90, 95],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
    // Dashboard uploads live in the site-media bucket. The pathname is pinned to
    // that one bucket rather than the whole host, so the optimizer will not
    // fetch from any other bucket on the project — `prescriptions` in
    // particular. That bucket is private and would 401 anyway; pinning means it
    // is never even requested.
    //
    // This is also why dangerouslyAllowSVG below stays safe: the bucket accepts
    // image/webp only, and the upload route re-encodes through sharp, so no SVG
    // can reach it. The allowance remains for local committed logos.
    remotePatterns: SUPABASE_HOST
      ? [
          {
            protocol: 'https',
            hostname: SUPABASE_HOST,
            pathname: '/storage/v1/object/public/site-media/**',
          },
        ]
      : [],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; sandbox;",
  },
  experimental: {
    // The proxy in src/proxy.ts matches /api/admin/:path*, and Next buffers a
    // proxied request body up to this limit — 10 MB by default — before handing
    // it to the route. The upload route allows images up to 12 MB, so anything
    // between the two arrived truncated: `file.size` then read 10 MB, passed the
    // size check, and reached sharp as an incomplete image. The upload failed
    // with "That file could not be read as an image", which is not what went
    // wrong and gives the editor nothing to act on.
    //
    // Set above the route's own ceiling (12 MB, refused over ~13.2 MB on the
    // declared length) so that the route's checks are always what decide, and a
    // body is never silently shortened on the way in.
    proxyClientMaxBodySize: '14mb',
  },
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  trailingSlash: false,
  compiler: {
    // `removeConsole: true` applies to the server compilation as well as the
    // browser one, so it was stripping every console.error in the API routes —
    // the routes deliberately answer with a generic message and keep the real
    // reason in the server log, and in a production build that log call was
    // being compiled away. A failed save left nothing behind to diagnose.
    //
    // `error` and `warn` are kept for that reason; console.log and console.info
    // are still removed, which is what the setting was added for.
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  headers: async () => {
    const isProd = process.env.NODE_ENV === 'production';
    const csp = [
      "default-src 'self'",
      // 'unsafe-inline' is required by Next.js bootstrap scripts, JSON-LD and
      // the inline GA snippet; 'unsafe-eval' is only needed by dev tooling.
      `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} https://www.googletagmanager.com`,
      "style-src 'self' 'unsafe-inline'",
      // The Supabase origin serves dashboard image uploads out of the
      // site-media bucket; next/image proxies most of them, but a direct
      // reference still has to be allowed.
      `img-src 'self' data: blob: https://www.google-analytics.com https://*.googletagmanager.com${SUPABASE_URL ? ` ${SUPABASE_URL}` : ''}`,
      // Inter is self-hosted by next/font out of /_next/static/media, so no
      // Google Fonts origin needs to be reachable.
      "font-src 'self' data:",
      // EmailJS (contact form), OpenAlex (citation metrics), Google Analytics,
      // and Supabase — the dashboard's sign-in and token refresh run from the
      // browser, so the auth endpoints must be reachable.
      `connect-src 'self' https://api.emailjs.com https://api.openalex.org https://www.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com${SUPABASE_URL ? ` ${SUPABASE_URL}` : ''}`,
      // Embedded Google Map on the contact page
      'frame-src https://www.google.com',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ');

    // CPMS's own policy. Kept as its own string rather than folded into the one
    // above: a union would hand the public site camera and geolocation access
    // and hand CPMS the analytics origins, which is the opposite of what either
    // app should get.
    const cpmsCsp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
      // Space Grotesk and Space Mono are self-hosted by next/font out of
      // /_next/static/media, so neither Google Fonts origin needs to be
      // reachable — same arrangement as Inter on the site.
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      // blob: is load-bearing — prescription scans and patient documents are
      // fetched with supabase.storage.download() and rendered as object URLs.
      // The Supabase origin is deliberately absent: nothing should be able to
      // put a signed storage URL straight into an <img>, and previews go
      // through the blob instead.
      // lh3 serves Google account avatars after sign-in.
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      // REST, auth, edge functions, and the realtime socket behind the
      // notification bell.
      `connect-src 'self'${SUPABASE_URL ? ` ${SUPABASE_URL} ${SUPABASE_URL.replace(/^https:/, 'wss:')}` : ''}`,
      // PDF documents preview in an iframe pointed at the downloaded blob.
      // default-src does not cover blob: for frames, so without this every PDF
      // preview renders blank. Only blob: and same-origin are allowed — the
      // Supabase origin stays unframeable, same reasoning as img-src above.
      "frame-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      // Google sign-in leaves the origin by top-level navigation, which
      // form-action does not govern.
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ');

    const cpmsHeaders = [
      { key: 'Content-Security-Policy', value: cpmsCsp },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=()' },
    ];

    return [
      {
        // Everything except /cpms and /cpms/*. Both apps now run in this
        // process, but they still cannot share one policy: this block sets
        // `camera=(), geolocation=()`, which would kill attendance check-in and
        // prescription scanning, and its connect-src has no Supabase origin.
        // The /cpms block below carries what that app needs. The exclusion is
        // what keeps the two from overwriting each other — a header `source`
        // that matches wins for the paths it matches, so an overlap here would
        // silently hand /cpms the wrong policy.
        source: '/:path((?!cpms$|cpms/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // CPMS. Ported from cpms-next/next.config.mjs, which stopped running
        // when that process went away. Four directives here are load-bearing
        // and differ from the site block above:
        //
        //   - Permissions-Policy grants camera and geolocation. Without them
        //     prescription scanning and attendance check-in stop working.
        //   - connect-src needs the Supabase origin *and* its wss: form; the
        //     realtime socket is what drives the notification bell.
        //   - img-src needs blob:. Scans and patient documents are pulled
        //     through supabase.storage.download() and rendered as object URLs,
        //     never as direct links, so without it every document renders
        //     blank.
        //   - frame-src needs blob: for the same reason, one level up: PDF
        //     documents preview inside an iframe pointed at that object URL,
        //     and frames fall back to default-src rather than img-src.
        source: '/cpms/:path*',
        headers: cpmsHeaders,
      },
      {
        // Next matches `source` against the exact path, so the pattern above —
        // which requires a segment after /cpms — does not cover /cpms itself.
        // That is the sign-in page, and it would otherwise be the one route in
        // the app served with no security headers at all.
        source: '/cpms',
        headers: cpmsHeaders,
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // /_next/static is deliberately absent: Next already serves it immutable,
      // and overriding it here makes the build warn that dev behaviour can break.
      {
        // Open Graph cards are fetched by social scrapers, never rendered on the
        // site, so cache lifetime buys nothing — but an immutable year would
        // pin a stale card in Facebook's and LinkedIn's caches with no way to
        // bust it short of renaming the file.
        source: '/images/og/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/images/:path((?!og/).*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

module.exports = nextConfig;
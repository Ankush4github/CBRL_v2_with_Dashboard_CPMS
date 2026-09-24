import { NextResponse, type NextRequest } from 'next/server';

import { clientIp, expectedOrigin, isAllowedIp, isAllowlistEnabled } from '@/lib/admin-network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the server believes about this request.
 *
 * `TRUSTED_PROXY_HOPS` and `ADMIN_ALLOWED_IPS` are otherwise configured blind:
 * you cannot tell from outside whether nginx is appending to `X-Forwarded-For`
 * or passing the caller's value through, and getting it wrong lets a spoofed
 * X-Forwarded-For past the allowlist. Check here first, then set the allowlist.
 *
 * Behind the session gate like every other admin endpoint.
 */
export async function GET(request: NextRequest) {
  const ip = clientIp(request);

  return NextResponse.json(
    {
      clientIp: ip,
      allowed: isAllowedIp(ip),
      allowlist: isAllowlistEnabled() ? 'on' : 'off (sign-in only)',
      trustedProxyHops: Number(process.env.TRUSTED_PROXY_HOPS ?? 1),
      expectedOrigin: expectedOrigin(request, request.nextUrl.origin),
      // The raw headers, so a mismatch between what the proxy sends and what
      // the app concludes is visible in one response.
      headers: {
        'x-forwarded-for': request.headers.get('x-forwarded-for'),
        'x-real-ip': request.headers.get('x-real-ip'),
        'x-forwarded-proto': request.headers.get('x-forwarded-proto'),
        'x-forwarded-host': request.headers.get('x-forwarded-host'),
        host: request.headers.get('host'),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

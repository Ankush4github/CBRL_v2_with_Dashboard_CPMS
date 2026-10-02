/**
 * Where a dashboard request came from, and whether it is allowed in.
 *
 * Next 16 exposes no socket address in either runtime, so `X-Forwarded-For` is
 * the only source of a client address — and that header is only trustworthy
 * from the *right*. A reverse proxy appends the peer it spoke to; everything
 * further left was supplied by the caller and can say anything. Counting from
 * the left is the classic mistake: a caller sending their own header mints a
 * fresh identity on every request and walks straight through any per-IP limit.
 *
 * Edge-runtime safe — `proxy.ts` imports this, so no `node:` builtins.
 */

/**
 * How many proxies sit in front of the app. Defaults to 1 for the nginx
 * deployment on IIT Kharagpur infrastructure; set to 0 only if Node is exposed
 * directly, in which case `X-Forwarded-For` is entirely caller-controlled and
 * gets ignored.
 */
function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(raw) && raw >= 0 ? raw : 1;
}

/* ------------------------------------------------------------ IP parsing */

/** 4 octets, or null. */
function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * 16 bytes, or null. Handles `::` compression and the IPv4-mapped
 * `::ffff:10.0.0.1` form the campus network may well hand us.
 */
function parseIpv6(value: string): number[] | null {
  let text = value;

  // A trailing dotted quad is the low 32 bits — rewrite it as two hex groups.
  const dotted = text.match(/(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const v4 = parseIpv4(dotted[2]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${dotted[1]}${hi}:${lo}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (!part) return [];
    const groups: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
    return groups;
  };

  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return null;

  let groups: number[];
  if (halves.length === 2) {
    const gap = 8 - head.length - tail.length;
    if (gap < 1) return null;
    groups = [...head, ...new Array(gap).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  return bytes;
}

/**
 * An address as bytes: 4 for IPv4, 16 for IPv6. IPv4-mapped IPv6 collapses to
 * its 4-byte form so `::ffff:10.111.4.13` matches a `10.111.0.0/16` rule.
 */
function toBytes(value: string): number[] | null {
  const trimmed = value.trim().replace(/^\[|\]$/g, '');
  if (!trimmed) return null;

  const v4 = parseIpv4(trimmed);
  if (v4) return v4;

  const v6 = parseIpv6(trimmed);
  if (!v6) return null;

  const mapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff;
  return mapped ? v6.slice(12) : v6;
}

export function isIpAddress(value: string): boolean {
  return toBytes(value) !== null;
}

/* --------------------------------------------------------------- client IP */

/**
 * The caller's address, or null when it cannot be established.
 *
 * Null is not "allow": with the allowlist on, isAllowedIp refuses an address it
 * cannot establish, so a misconfigured proxy locks the dashboard rather than
 * opening it.
 */
export function clientIp(request: Request): string | null {
  const hops = trustedHops();

  // Ports may ride along on IPv4 entries; strip them, but leave bare IPv6
  // (which is full of colons) alone.
  const strip = (entry: string) => {
    const value = entry.trim();
    const match = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    return match ? match[1] : value;
  };

  if (hops > 0) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',').map(strip).filter(Boolean);
      // The nth entry from the right was written by the nth proxy in; anything
      // to its left is hearsay from the caller.
      const candidate = parts[parts.length - hops];
      if (candidate && isIpAddress(candidate)) return candidate;
    }

    // Some proxies send only this one, and it is a single value the proxy set
    // itself rather than a caller-extendable list.
    const real = request.headers.get('x-real-ip');
    if (real && isIpAddress(strip(real))) return strip(real);
  }

  return null;
}

/**
 * Request header the proxy uses to hand the refused address to the
 * "Network Access Restricted" page it rewrites to. Set only by the proxy, and
 * stripped from every request it lets through, so the page cannot be made to
 * appear -- or to show a chosen address -- by a caller supplying it.
 */
export const RESTRICTED_IP_HEADER = 'x-cbrl-restricted-ip';

/** Where the proxy sends a dashboard page request from outside the allowlist. */
export const RESTRICTED_PAGE_PATH = '/admin/network-restricted';

/* --------------------------------------------------------------- allowlist */

interface Rule {
  bytes: number[];
  bits: number;
}

function parseRule(entry: string): Rule | null {
  const [address, prefix] = entry.trim().split('/');
  const bytes = toBytes(address ?? '');
  if (!bytes) return null;

  const maxBits = bytes.length * 8;
  if (prefix === undefined) return { bytes, bits: maxBits };

  if (!/^\d{1,3}$/.test(prefix)) return null;
  const bits = Number(prefix);
  if (bits > maxBits) return null;
  return { bytes, bits };
}

function withinRule(address: number[], rule: Rule): boolean {
  // An IPv4 address never sits inside an IPv6 range, or the other way round.
  if (address.length !== rule.bytes.length) return false;

  const wholeBytes = Math.floor(rule.bits / 8);
  for (let i = 0; i < wholeBytes; i++) {
    if (address[i] !== rule.bytes[i]) return false;
  }

  const remainder = rule.bits % 8;
  if (remainder === 0) return true;

  const mask = 0xff << (8 - remainder);
  return (address[wholeBytes] & mask) === (rule.bytes[wholeBytes] & mask);
}

/** Rules from `ADMIN_ALLOWED_IPS`, or null when the allowlist is switched off. */
function allowRules(): Rule[] | null {
  const raw = process.env.ADMIN_ALLOWED_IPS?.trim();
  if (!raw) return null;

  const rules = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseRule)
    .filter((rule): rule is Rule => rule !== null);

  // An allowlist of nothing but typos would lock everyone out with no way back
  // in short of editing the env — treat it as unset and let sign-in stand.
  return rules.length > 0 ? rules : null;
}

export function isAllowlistEnabled(): boolean {
  return allowRules() !== null;
}

/**
 * Whether this address may reach the dashboard at all.
 *
 * With no `ADMIN_ALLOWED_IPS` set, everything is allowed and sign-in (Google plus
 * a site_editors grant) is the only gate — the deployed default, so switching
 * the allowlist on later is purely additive.
 */
export function isAllowedIp(ip: string | null): boolean {
  const rules = allowRules();
  if (!rules) return true;

  // The allowlist is on but the address is unknown: refuse, rather than let an
  // unidentifiable caller past a restriction someone deliberately configured.
  if (!ip) return false;

  const address = toBytes(ip);
  if (!address) return false;

  return rules.some((rule) => withinRule(address, rule));
}

/* ------------------------------------------------------------ same origin */

/**
 * The origin this deployment answers on.
 *
 * `nextUrl.origin` can carry the internal `localhost:3000` behind a proxy, so
 * the forwarded headers win. `ADMIN_ORIGIN` pins it explicitly when the headers
 * cannot be relied on.
 */
export function expectedOrigin(request: Request, fallback: string): string {
  const pinned = process.env.ADMIN_ORIGIN?.trim();
  if (pinned) return pinned.replace(/\/$/, '');

  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0].trim() ||
    request.headers.get('host')?.trim();
  if (!host) return fallback;

  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    new URL(fallback).protocol.replace(':', '');

  return `${proto}://${host}`;
}

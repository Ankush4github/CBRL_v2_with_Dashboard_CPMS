// Checks for src/lib/admin-network.ts — the IP parsing and CIDR matching the
// dashboard's rate limit and allowlist depend on. Subtle to get right, so it is
// worth having these pinned down.
//
//   npx tsx scripts/test-admin-network.mts
//
import { clientIp, isAllowedIp, isIpAddress, isAllowlistEnabled, expectedOrigin } from '../src/lib/admin-network.ts';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}
const req = (headers: Record<string, string>) => new Request('http://localhost:3000/admin', { headers });

console.log('--- IP validity ---');
for (const v of ['10.0.0.1', '255.255.255.255', '::1', '2001:db8::1', '::ffff:10.111.4.13', 'fe80::1%eth0'.split('%')[0]]) check(v, isIpAddress(v), true);
for (const v of ['', '10.0.0', '10.0.0.256', '999.1.1.1', 'notanip', '10.0.0.1.5', '2001:db8::1::2', 'gggg::1']) check(v, isIpAddress(v), false);

console.log('--- clientIp: 1 hop (nginx appends) ---');
process.env.TRUSTED_PROXY_HOPS = '1';
check('spoof + real', clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' })), '203.0.113.9');
check('spoofed chain', clientIp(req({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 203.0.113.9' })), '203.0.113.9');
check('single value', clientIp(req({ 'x-forwarded-for': '203.0.113.9' })), '203.0.113.9');
check('with port', clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9:51234' })), '203.0.113.9');
check('ipv6', clientIp(req({ 'x-forwarded-for': '1.2.3.4, 2001:db8::5' })), '2001:db8::5');
check('junk rightmost', clientIp(req({ 'x-forwarded-for': '203.0.113.9, garbage' })), null);
check('no header', clientIp(req({})), null);
check('x-real-ip only', clientIp(req({ 'x-real-ip': '203.0.113.9' })), '203.0.113.9');

console.log('--- clientIp: 0 hops (node exposed directly) ---');
process.env.TRUSTED_PROXY_HOPS = '0';
check('xff ignored', clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' })), null);
check('x-real-ip ignored', clientIp(req({ 'x-real-ip': '1.2.3.4' })), null);

console.log('--- clientIp: 2 hops ---');
process.env.TRUSTED_PROXY_HOPS = '2';
check('second from right', clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9, 10.0.0.1' })), '203.0.113.9');
process.env.TRUSTED_PROXY_HOPS = '1';

console.log('--- allowlist off ---');
delete process.env.ADMIN_ALLOWED_IPS;
check('enabled?', isAllowlistEnabled(), false);
check('anything allowed', isAllowedIp('8.8.8.8'), true);
check('null allowed', isAllowedIp(null), true);

console.log('--- allowlist: IPv4 CIDR ---');
process.env.ADMIN_ALLOWED_IPS = '10.111.0.0/16, 203.0.113.5';
check('enabled?', isAllowlistEnabled(), true);
check('in /16', isAllowedIp('10.111.4.13'), true);
check('edge of /16', isAllowedIp('10.111.255.255'), true);
check('outside /16', isAllowedIp('10.112.0.1'), false);
check('exact host', isAllowedIp('203.0.113.5'), true);
check('near exact host', isAllowedIp('203.0.113.6'), false);
check('null refused', isAllowedIp(null), false);
check('ipv6 vs v4 rule', isAllowedIp('2001:db8::1'), false);
check('v4-mapped v6 matches v4 rule', isAllowedIp('::ffff:10.111.4.13'), true);

console.log('--- allowlist: boundaries ---');
process.env.ADMIN_ALLOWED_IPS = '10.0.0.7/32';
check('/32 exact', isAllowedIp('10.0.0.7'), true);
check('/32 neighbour', isAllowedIp('10.0.0.8'), false);
process.env.ADMIN_ALLOWED_IPS = '0.0.0.0/0';
check('/0 allows all v4', isAllowedIp('198.51.100.1'), true);
check('/0 still refuses v6', isAllowedIp('2001:db8::1'), false);
process.env.ADMIN_ALLOWED_IPS = '10.0.0.0/12';
check('/12 in (non-byte boundary)', isAllowedIp('10.15.255.1'), true);
check('/12 out', isAllowedIp('10.16.0.1'), false);

console.log('--- allowlist: IPv6 ---');
process.env.ADMIN_ALLOWED_IPS = '2001:db8::/32, ::1';
check('in /32', isAllowedIp('2001:db8:1234::9'), true);
check('outside /32', isAllowedIp('2001:db9::1'), false);
check('loopback exact', isAllowedIp('::1'), true);
check('v4 vs v6 rule', isAllowedIp('10.0.0.1'), false);
process.env.ADMIN_ALLOWED_IPS = '2001:db8::/33';
check('/33 in', isAllowedIp('2001:db8:7fff::1'), true);
check('/33 out', isAllowedIp('2001:db8:8000::1'), false);

console.log('--- allowlist: all-typo entry falls back to off ---');
process.env.ADMIN_ALLOWED_IPS = 'not-an-ip, also/bad';
check('enabled?', isAllowlistEnabled(), false);
check('allows through', isAllowedIp('8.8.8.8'), true);
delete process.env.ADMIN_ALLOWED_IPS;

console.log('--- expectedOrigin ---');
check('forwarded headers win', expectedOrigin(req({ host: 'localhost:3000', 'x-forwarded-host': 'cbrl.iitkgp.ac.in', 'x-forwarded-proto': 'https' }), 'http://localhost:3000'), 'https://cbrl.iitkgp.ac.in');
check('host fallback', expectedOrigin(req({ host: 'cbrl.iitkgp.ac.in' }), 'http://localhost:3000'), 'http://cbrl.iitkgp.ac.in');
process.env.ADMIN_ORIGIN = 'https://cbrl.iitkgp.ac.in/';
check('pinned wins, slash trimmed', expectedOrigin(req({ host: 'evil.example' }), 'http://localhost:3000'), 'https://cbrl.iitkgp.ac.in');
delete process.env.ADMIN_ORIGIN;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

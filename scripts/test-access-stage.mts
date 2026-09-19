// Checks for src/lib/cpms/access.ts — the rule the CPMS route guards use to
// decide where a signed-in account belongs. Three guards compare their own
// route against this one answer, so a wrong answer here does not misplace one
// page, it puts an account somewhere it cannot leave.
//
//   npx tsx scripts/test-access-stage.mts
//
import { landingRouteFor, type AccountState } from '../src/lib/cpms/access.ts';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

// Named so each case below reads as the account it describes rather than as
// three booleans in an order the reader has to remember.
const account = (over: Partial<AccountState> = {}): AccountState => ({
  isAdminOrHigher: false,
  isEnabled: false,
  onboardingCompleted: false,
  ...over,
});

console.log('--- the invited account, step by step ---');
// Invited, has just signed in with Google. handle_new_user() gave it the role
// and hospitals from the invitation and deliberately no user_permissions row.
check(
  'signed in, not activated -> pending',
  landingRouteFor(account()),
  '/pending'
);
// The master clicks Activate. Everything else about the account is unchanged.
check(
  'activated, profile not filled in -> onboarding',
  landingRouteFor(account({ isEnabled: true })),
  '/onboarding'
);
check(
  'activated, profile complete -> dashboard',
  landingRouteFor(account({ isEnabled: true, onboardingCompleted: true })),
  '/dashboard'
);

console.log('--- activation is checked before onboarding ---');
// The ordering matters on its own: an account that has done both halves of
// signup but was never enabled must still be held at the pending screen, not
// waved through to a dashboard where every action is refused.
check(
  'onboarded but never activated -> pending, not dashboard',
  landingRouteFor(account({ onboardingCompleted: true })),
  '/pending'
);

console.log('--- administrators skip the activation gate ---');
// An admin's own user_permissions row is optional — handle_new_user() has never
// created one — and admins are who lift a pending state. Gating them on it is
// how the last master locks everybody out, itself included.
check(
  'admin with no permissions row -> onboarding',
  landingRouteFor(account({ isAdminOrHigher: true })),
  '/onboarding'
);
check(
  'admin with no permissions row, onboarded -> dashboard',
  landingRouteFor(account({ isAdminOrHigher: true, onboardingCompleted: true })),
  '/dashboard'
);
check(
  'admin that is also enabled -> dashboard',
  landingRouteFor(account({ isAdminOrHigher: true, isEnabled: true, onboardingCompleted: true })),
  '/dashboard'
);

console.log('--- every input combination lands somewhere ---');
// The guards render a spinner whenever the answer is not their own route, so a
// state with no answer is an account stuck on a spinner with no way out. There
// are only eight, so check all of them rather than reason about it.
const routes = new Set<string>();
for (const isAdminOrHigher of [false, true]) {
  for (const isEnabled of [false, true]) {
    for (const onboardingCompleted of [false, true]) {
      const state = { isAdminOrHigher, isEnabled, onboardingCompleted };
      const route = landingRouteFor(state);
      check(
        `resolves: ${JSON.stringify(state)}`,
        ['/pending', '/onboarding', '/dashboard'].includes(route),
        true
      );
      routes.add(route);
    }
  }
}
// And that no route is unreachable — a guard whose route nothing resolves to is
// a page that can never be shown.
check('all three routes are reachable', [...routes].sort(), ['/dashboard', '/onboarding', '/pending']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

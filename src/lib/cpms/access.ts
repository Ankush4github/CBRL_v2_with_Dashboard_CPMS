/**
 * Where a signed-in account belongs.
 *
 * Pulled out of guards.tsx as a plain function so the rule can be read in one
 * place and tested without a browser (scripts/test-access-stage.mts). Three
 * guards ask the same question — ProtectedRoute, PendingRoute and PublicRoute —
 * and before this they each spelled out their own half of the answer, which is
 * how a route can end up bouncing between two guards that disagree.
 */

/** The three places a signed-in account can legitimately be sent. */
export type LandingRoute = '/pending' | '/onboarding' | '/dashboard';

export interface AccountState {
  /**
   * Role is 'admin' or 'master' — `isAdmin` from useRole, which is already the
   * union of the two.
   */
  isAdminOrHigher: boolean;
  /**
   * `user_permissions.is_enabled`, read the way the database reads it: a
   * missing row, a null column and a failed fetch are all false. useRole
   * collapses those to `permissions?.is_enabled === true` for exactly this.
   */
  isEnabled: boolean;
  /** `profiles.onboarding_completed`. Null counts as not completed. */
  onboardingCompleted: boolean;
}

/**
 * Activation is checked before onboarding, on purpose.
 *
 * An account that is not enabled cannot read a patient record, write one, or
 * check in — every clinical policy is gated on user_is_enabled(). Sending it
 * through the profile form first would ask someone to fill in their job title
 * as the price of being told they cannot do anything yet. So the pending screen
 * comes first, and the profile form is what greets them on the day their
 * administrator switches the account on.
 *
 * Administrators skip the activation gate entirely. This is not a courtesy: an
 * admin's own `user_permissions` row is optional (handle_new_user has never
 * created one) and their job is to activate other people. Gating them on it
 * would mean the only account that can lift a pending state could itself be
 * stuck in one, with nobody able to reach the page that fixes it.
 */
export function landingRouteFor(state: AccountState): LandingRoute {
  if (!state.isAdminOrHigher && !state.isEnabled) return '/pending';
  if (!state.onboardingCompleted) return '/onboarding';
  return '/dashboard';
}

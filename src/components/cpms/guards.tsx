"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/cpms/useAuth";
import { useRole } from "@/hooks/cpms/useRole";
import { asset } from "@/lib/cpms/base-path";
import { landingRouteFor, type LandingRoute } from "@/lib/cpms/access";

/**
 * Route guards ported from the Vite app's App.tsx.
 *
 * React Router's declarative `<Navigate to="..." replace />` has no direct Next
 * equivalent — App Router redirects either happen server-side via redirect() or
 * client-side via router.replace(). Because every guard decision here depends on
 * client-only state (a Supabase session held in localStorage), these stay client
 * components and redirect from an effect. The guard renders the spinner while the
 * redirect is in flight, so the gated children never flash on screen.
 */

export const LoadingSpinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Shown when the profile or the role cannot be loaded. Without this the guards
// below would wait on an answer that is never coming, leaving the user on a
// spinner with no way out but clearing their session.
export const ProfileErrorScreen = ({
  title = "Couldn’t load your profile",
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
} = {}) => {
  const { profileError, refreshProfile, signOut } = useAuth();
  const retry = onRetry ?? refreshProfile;
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{message ?? profileError}</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => retry()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Try again
          </button>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 rounded-md border text-sm font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

type Placement =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "profile-error" }
  // The role or permissions read failed. Distinct from a resolved placement of
  // '/pending': both fail closed, but only one of them is true.
  | { status: "account-error"; message: string }
  | { status: "resolved"; route: LandingRoute };

/**
 * The screen an unresolvable placement calls for, or null when it resolves.
 *
 * Shared by RouteFor and PublicRoute. PublicRoute used to skip this: it derived
 * its redirect from `status === "resolved"` alone, so a profile error left a
 * signed-in visitor on /cpms -- the OAuth redirect target, and the URL people
 * type -- watching a spinner with no Try again and no Sign out. The only way
 * out was clearing site data.
 */
function placementError(placement: Placement, retryAccount: () => void) {
  if (placement.status === "profile-error") return <ProfileErrorScreen />;
  if (placement.status === "account-error") {
    return (
      <ProfileErrorScreen
        title="Couldn’t load your access"
        message={placement.message}
        onRetry={retryAccount}
      />
    );
  }
  return null;
}

/**
 * Where this visitor belongs, or why we cannot say yet.
 *
 * Every guard below asks this and then compares the answer to the route it is
 * standing on. Previously each spelled out its own share of the rule inline,
 * which is how /onboarding and /dashboard could both decide the other one was
 * right and bounce a user between them; there is now one rule, in
 * lib/cpms/access.ts, and one place that reads the state it needs.
 *
 * Role is part of that state now, so the guards wait for `roleLoading` too.
 * That is a third condition to settle before anything renders, but it is the
 * one that separates "not activated yet" from "activated" — deciding without it
 * would send every account to the pending screen for a frame, activated ones
 * included.
 */
function usePlacement(): Placement {
  const { user, profile, loading, profileLoaded, profileError } = useAuth();
  const { isAdmin, permissions, loading: roleLoading, error: roleError } = useRole();

  if (loading) return { status: "loading" };
  if (!user) return { status: "signed-out" };
  if (profileError) return { status: "profile-error" };
  // A failed read is not an answer. Routing on it would tell an activated user
  // that their administrator has not switched them on yet, which is both wrong
  // and unactionable -- the fix is to retry, not to go and find somebody.
  if (roleError) return { status: "account-error", message: roleError };
  // Wait for the profile fetch to settle — not merely for `profile` to be
  // non-null. A null profile is otherwise indistinguishable from a pending one.
  if (!profileLoaded || roleLoading) return { status: "loading" };

  return {
    status: "resolved",
    route: landingRouteFor({
      isAdminOrHigher: isAdmin,
      // `=== true` so a null permissions object — a failed fetch, or no row at
      // all — reads as not enabled, which is how the database reads it.
      isEnabled: permissions?.is_enabled === true,
      onboardingCompleted: profile?.onboarding_completed === true,
    }),
  };
}

/**
 * Shared body for the three guards that gate one route each: send the visitor
 * wherever they belong, and render the children only when that is here.
 */
const RouteFor = ({ here, children }: { here: LandingRoute; children: ReactNode }) => {
  const placement = usePlacement();
  const { refetch: refetchAccount } = useRole();
  const router = useRouter();

  const redirectTo =
    placement.status === "signed-out"
      ? "/"
      : placement.status === "resolved" && placement.route !== here
        ? placement.route
        : null;

  useEffect(() => {
    if (redirectTo) router.replace(asset(redirectTo));
  }, [redirectTo, router]);

  const blocked = placementError(placement, refetchAccount);
  if (blocked) return blocked;
  if (placement.status !== "resolved" || redirectTo) return <LoadingSpinner />;

  return <>{children}</>;
};

/** Requires auth, an activated account, AND completed onboarding. */
export const ProtectedRoute = ({ children }: { children: ReactNode }) => (
  <RouteFor here="/dashboard">{children}</RouteFor>
);

/** Requires auth and an activated account, but NOT completed onboarding. */
export const OnboardingRoute = ({ children }: { children: ReactNode }) => (
  <RouteFor here="/onboarding">{children}</RouteFor>
);

/**
 * Requires auth and an account that is not yet activated.
 *
 * Once an administrator enables the account this stops matching and the same
 * comparison that kept them here moves them on, without the pending screen
 * needing to navigate anywhere itself.
 */
export const PendingRoute = ({ children }: { children: ReactNode }) => (
  <RouteFor here="/pending">{children}</RouteFor>
);

/** Redirects already-authenticated users away from the sign-in page. */
export const PublicRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const placement = usePlacement();
  const { refetch: refetchAccount } = useRole();
  const router = useRouter();

  const redirectTo = placement.status === "resolved" ? placement.route : null;

  useEffect(() => {
    if (redirectTo) router.replace(asset(redirectTo));
  }, [redirectTo, router]);

  if (loading) return <LoadingSpinner />;
  // Before falling through to the spinner: a signed-in visitor whose profile or
  // role cannot be read is going nowhere, and this is the page they land on.
  // Without this they wait on a redirect that will never fire.
  const blocked = placementError(placement, refetchAccount);
  if (blocked) return blocked;
  // A signed-in visitor never sees the sign-in page, including for the frame or
  // two it takes their profile and role to load and the redirect to fire.
  if (user) return <LoadingSpinner />;

  return <>{children}</>;
};

/**
 * Role gate for /admin/* — declarative, so a new admin page cannot ship without
 * one. Each admin page still checks its own role: RLS is the real boundary and
 * this is defence in depth, not a replacement for either.
 */
export const RoleRoute = ({
  children,
  requires,
}: {
  children: ReactNode;
  requires: "admin" | "master";
}) => {
  const { isAdmin, isMaster, loading: roleLoading } = useRole();
  const router = useRouter();

  const allowed = requires === "master" ? isMaster : isAdmin;
  const denied = !roleLoading && !allowed;

  useEffect(() => {
    if (denied) router.replace(asset("/dashboard"));
  }, [denied, router]);

  if (roleLoading) return <LoadingSpinner />;
  if (!allowed) return <LoadingSpinner />;

  return <>{children}</>;
};

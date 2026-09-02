"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/cpms/useAuth";
import { useRole } from "@/hooks/cpms/useRole";
import { asset } from "@/lib/cpms/base-path";

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

// Shown when the profile cannot be loaded. Without this the guards below would
// wait on a profile that is never coming, leaving the user on a spinner with no
// way out but clearing their session.
export const ProfileErrorScreen = () => {
  const { profileError, refreshProfile, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-bold">Couldn&apos;t load your profile</h2>
        <p className="text-sm text-muted-foreground">{profileError}</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => refreshProfile()}
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

/** Requires auth AND completed onboarding. */
export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading, profileLoaded, profileError } = useAuth();
  const router = useRouter();

  const redirectTo = !loading && !user
    ? "/"
    : !loading && !profileError && profileLoaded && profile && !profile.onboarding_completed
      ? "/onboarding"
      : null;

  useEffect(() => {
    if (redirectTo) router.replace(asset(redirectTo));
  }, [redirectTo, router]);

  if (loading) return <LoadingSpinner />;
  if (!user) return <LoadingSpinner />;
  if (profileError) return <ProfileErrorScreen />;
  // Wait for the profile fetch to settle — not merely for `profile` to be non-null
  if (!profileLoaded) return <LoadingSpinner />;
  if (redirectTo) return <LoadingSpinner />;

  return <>{children}</>;
};

/** Requires auth but NOT completed onboarding. */
export const OnboardingRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading, profileLoaded, profileError } = useAuth();
  const router = useRouter();

  const redirectTo = !loading && !user
    ? "/"
    : !loading && !profileError && profileLoaded && profile && profile.onboarding_completed
      ? "/dashboard"
      : null;

  useEffect(() => {
    if (redirectTo) router.replace(asset(redirectTo));
  }, [redirectTo, router]);

  if (loading) return <LoadingSpinner />;
  if (!user) return <LoadingSpinner />;
  if (profileError) return <ProfileErrorScreen />;
  if (!profileLoaded) return <LoadingSpinner />;
  if (redirectTo) return <LoadingSpinner />;

  return <>{children}</>;
};

/** Redirects already-authenticated users away from the sign-in page. */
export const PublicRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const redirectTo = !loading && user
    ? profile && !profile.onboarding_completed
      ? "/onboarding"
      : "/dashboard"
    : null;

  useEffect(() => {
    if (redirectTo) router.replace(asset(redirectTo));
  }, [redirectTo, router]);

  if (loading) return <LoadingSpinner />;
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

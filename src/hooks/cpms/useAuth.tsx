"use client";

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/cpms-client';
import { asset } from '@/lib/cpms/base-path';
import { describeError } from '@/lib/cpms/errors';

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  clinic_name: string | null;
  staff_role: string | null;
  onboarding_completed: boolean | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** True once a profile fetch has settled, successfully or not. Distinguishes
   *  "still loading" from "loaded, but there is no profile" — without it a
   *  null profile is indistinguishable from a pending fetch and the route
   *  guards spin forever. */
  profileLoaded: boolean;
  /** Non-null when the last profile fetch failed, so the UI can offer a retry
   *  instead of hanging. */
  profileError: string | null;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, clinic_name, staff_role, onboarding_completed')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // The field-by-field console.error that used to sit here now lives in
        // describeError(), which logs the same `code`/`details`/`hint` — the
        // fields that actually separate an RLS refusal from a bad column from a
        // dropped request — but only in a development build.
        // Never `error.message`: an RLS refusal here reads "permission denied
        // for table profiles", which is rendered on the error screen. It also
        // could not be relied on — on a network failure `message` is absent
        // entirely, which left profileError falsy and the screen blank.
        setProfileError(describeError(error, 'Could not load your profile.'));
        return;
      }

      if (!data) {
        // handle_new_user() should have created this row at signup. Its absence
        // means the app cannot tell whether onboarding is done, so surface it
        // rather than leaving the guards waiting on a profile that never comes.
        setProfileError('No profile found for this account.');
        return;
      }

      setProfile(data);
    } catch (err) {
      setProfileError(describeError(err, 'Could not load your profile.'));
    } finally {
      setProfileLoaded(true);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    // Whose profile has been fetched, so a repeat event for the same account
    // does not fetch it again.
    let profileUserId: string | null = null;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        // supabase-js re-emits SIGNED_IN (and TOKEN_REFRESHED) every time the
        // tab becomes visible again, each with a new `user` object for the
        // same account. Replacing ours made everything keyed on `user` start
        // over -- useRole went back to loading, the route guards swapped the
        // page for a spinner, and the page remounted: switching tabs looked
        // like a reload and threw away a half-finished scan. The same account
        // keeps the same object, unless its details really changed.
        const nextUser = session?.user ?? null;
        setUser((prev) =>
          prev && nextUser && prev.id === nextUser.id && event !== 'USER_UPDATED' ? prev : nextUser,
        );
        setLoading(false);

        // Defer profile fetch to avoid Supabase deadlock
        if (session?.user) {
          const userId = session.user.id;
          if (userId !== profileUserId || event === 'USER_UPDATED') {
            profileUserId = userId;
            setTimeout(() => {
              fetchProfile(userId);
            }, 0);
          }
        } else {
          profileUserId = null;
          setProfile(null);
          setProfileLoaded(false);
          setProfileError(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const nextUser = session?.user ?? null;
      setUser((prev) => (prev && nextUser && prev.id === nextUser.id ? prev : nextUser));
      setLoading(false);

      if (session?.user) {
        // The listener above usually fires first with the same session.
        if (session.user.id !== profileUserId) {
          profileUserId = session.user.id;
          fetchProfile(session.user.id);
        }
      } else {
        setProfileLoaded(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signInWithGoogle = async () => {
    // Must include the basePath: Supabase redirects the browser straight to this
    // URL, so without it Google sign-in lands on the main CBRL site's /dashboard
    // (a 404) instead of coming back into CPMS. This exact URL also has to be
    // registered under Supabase -> Authentication -> URL Configuration.
    const redirectUrl = `${window.location.origin}${asset('/dashboard')}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        // Always show Google's account chooser. Without it Google silently
        // reuses whichever account was last active in the browser, so a shared
        // workstation signs the next clinician in as the previous one.
        queryParams: { prompt: 'select_account' },
      },
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    // `scope: 'local'` clears this browser's session without revoking the
    // account's refresh tokens server-side.
    //
    // The default is 'global', which revokes them everywhere the account is
    // signed in — the same clinician's phone, and the website dashboard at
    // /admin on this origin. That is reached by the five-minute inactivity
    // timeout as well as the sign-out button, so an unattended tab was quietly
    // signing the account out of every other device it had.
    //
    // The dashboard's own logout route already takes this care in the other
    // direction and says so; it only works if both sides do it.
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileLoaded(false);
    setProfileError(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, profileLoaded, profileError, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

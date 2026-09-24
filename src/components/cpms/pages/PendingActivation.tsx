"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/cpms/ui/button";
import { Badge } from "@/components/cpms/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Building2, Crown, Hourglass, LogOut, Mail, RefreshCw, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/hooks/cpms/useAuth";
import { useRole } from "@/hooks/cpms/useRole";
import { supabase } from "@/lib/supabase/cpms-client";
import { describeError } from "@/lib/cpms/errors";
import { asset } from "@/lib/cpms/base-path";
import { toast } from "sonner";

/**
 * What an account sees between signing in and being switched on.
 *
 * Before this screen existed, a new sign-in landed on the dashboard. Nothing
 * there is technically broken for a disabled account — the row-level policies
 * simply return nothing — so it rendered a working-looking home screen with
 * zeroes in every card, and each action the person tried came back "You do not
 * have permission to do that." Nobody could tell that from a bug, and the
 * accounts that reached it were often the ones an administrator was in the
 * middle of setting up.
 *
 * The state it describes is the absence of an *enabled* `user_permissions`
 * row, and that covers two different situations:
 *
 *   - No row at all. This is the new-signup case, and it is exactly what
 *     UserManagement.tsx lists under "Awaiting approval" -- the two screens are
 *     the two ends of that one queue.
 *   - A row with `is_enabled = false`. An administrator switched this account
 *     off on purpose. It is deliberately *not* in the approval queue; it is in
 *     the main user table, badged "Disabled", where it can be switched back on.
 *
 * The copy below tells them apart, because "an administrator still has to
 * switch it on" is the wrong thing to say to somebody whose access was taken
 * away, and it sends them to ask for something nobody is waiting to do.
 */

const roleLabels: Record<string, string> = {
  master: "Master administrator",
  admin: "Hospital administrator",
  user: "Staff",
};

const PendingActivation = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { role, assignedHospitals, refetch, permissions, hasPermissionsRow } = useRole();

  // A row that exists and says false was switched off; no row at all has never
  // been switched on. `permissions` alone cannot tell these apart -- it reads a
  // missing row as all-false, the way the database does.
  const switchedOff = hasPermissionsRow && permissions?.is_enabled === false;
  const [checking, setChecking] = useState(false);

  /**
   * Reads `is_enabled` straight from the table rather than trusting the copy in
   * context. The context copy is what put this screen on screen in the first
   * place, so re-rendering from it cannot tell the person anything new; the
   * point of the button is to go and ask again.
   *
   * On a yes it still calls refetch(), because PendingRoute is what actually
   * moves them — this component does not navigate itself, so there is one
   * routing rule rather than two that can disagree.
   */
  const checkAgain = async () => {
    if (!user) return;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("is_enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.is_enabled === true) {
        toast.success("Your account is active. Taking you in…");
        await refetch();
      } else if (switchedOff) {
        toast("Your access is still switched off.", {
          description: "Nothing has changed yet. You will not need to sign in again — just check back.",
        });
      } else {
        toast("Still waiting on your administrator.", {
          description: "Nothing has changed yet. You will not need to sign in again — just check back.",
        });
      }
    } catch (error) {
      toast.error(describeError(error, "Could not check your account status. Please try again."));
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push(asset("/"));
  };

  const RoleIcon = role === "master" ? Crown : role === "admin" ? ShieldCheck : User;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={asset("/cbrl-logo.png")}
              alt="CBRL Logo"
              className="h-9 w-9 sm:h-10 sm:w-10 object-contain shrink-0"
            />
            <span className="font-bold text-lg sm:text-xl tracking-tight truncate">CPMS</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2 shrink-0">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center p-3 sm:p-4 lg:p-8">
        <div className="w-full max-w-xl space-y-4">
          <Card className="border-2">
            <CardHeader className="space-y-3">
              <div className="h-12 w-12 bg-primary/10 flex items-center justify-center">
                <Hourglass className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1.5">
                <CardTitle className="text-xl sm:text-2xl">
                  {switchedOff ? "Access switched off" : "Pending activation"}
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {switchedOff
                    ? "Your account is set up, but an administrator has switched its access off. Until it is switched back on you cannot open patient records or check in for a shift."
                    : "Your account has been created and your access is already set up. An administrator still has to switch it on before you can open patient records or check in for a shift."}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="border-2 border-border divide-y-2 divide-border">
                <div className="flex items-start gap-3 p-3">
                  <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Signed in as
                    </p>
                    <p className="text-sm font-medium break-all">{user?.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3">
                  <RoleIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Role you were given
                    </p>
                    <p className="text-sm font-medium">{roleLabels[role] ?? "Staff"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3">
                  <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      Hospitals
                    </p>
                    {assignedHospitals.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {assignedHospitals.map((h) => (
                          <Badge key={h} variant="outline" className="text-xs">
                            {h}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      // A walk-in signup — someone who reached the sign-in page
                      // without an invitation — gets here too, with nothing
                      // assigned. Saying so is more use than an empty row.
                      <p className="text-sm text-muted-foreground">
                        None assigned yet. Your administrator will pick these when they set up your
                        account.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={checkAgain} disabled={checking} className="flex-1 gap-2 h-11">
                  <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                  {checking ? "Checking…" : "Check again"}
                </Button>
                <Button variant="outline" onClick={handleSignOut} className="gap-2 h-11">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Nothing is lost while you wait — your account keeps the role and hospitals above.
                {switchedOff
                  ? " If you were not expecting this, ask your administrator why the account was switched off, or write to "
                  : " If this is taking longer than you expected, contact the person who invited you or write to "}
                <a href="mailto:contact.cbrl@smst.iitkgp.ac.in" className="underline hover:text-foreground">
                  contact.cbrl@smst.iitkgp.ac.in
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="p-4 text-center text-sm text-muted-foreground">
        <p>
          © 2026-27{" "}
          <a
            href="https://cbrl.iitkgp.ac.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Clinical Biomarker Research Laboratory
          </a>
          , IIT Kharagpur.
        </p>
      </footer>
    </div>
  );
};

export default PendingActivation;

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Input } from "@/components/cpms/ui/input";
import { Label } from "@/components/cpms/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/cpms/ui/select";
import { Switch } from "@/components/cpms/ui/switch";
import { Badge } from "@/components/cpms/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/cpms/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/cpms/ui/dialog";
import {
  Activity,
  ArrowLeft,
  Users,
  Shield,
  Building2,
  Search,
  Loader2,
  UserCog,
  Crown,
  ShieldCheck,
  User,
  Plus,
  X,
  RefreshCw,
  UserPlus,
  Mail,
  Send,
  Ban,
  MailCheck,
  Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { useToast } from "@/hooks/cpms/use-toast";
import { describeError, describeInvokeError } from "@/lib/cpms/errors";
import { useRole, UserRole } from "@/hooks/cpms/useRole";
import { useAuth } from "@/hooks/cpms/useAuth";
import { useHospitals } from "@/hooks/cpms/useHospitals";
import { asset } from "@/lib/cpms/base-path";

interface UserWithDetails {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  hospitals: string[];
  permissions: {
    can_scan: boolean;
    can_upload: boolean;
    is_enabled: boolean;
  } | null;
}

/**
 * An invitation that has been sent and not yet taken up.
 *
 * Accepted and revoked rows stay in staff_invitations as the record of who
 * granted what, but they are not what this screen is for: once an invitation is
 * accepted the person is an ordinary account and appears in the lists below.
 */
interface Invitation {
  id: string;
  email: string;
  role: string;
  hospitals: string[];
  created_at: string;
  // From migration 20260927140000; absent on a database without it.
  expires_at?: string;
  last_emailed_at?: string | null;
  email_count?: number;
}

/** How long a new or extended invitation stays open. Matches the column default. */
const INVITATION_DAYS = 30;

const invitationExpired = (invite: Invitation) =>
  !!invite.expires_at && Date.parse(invite.expires_at) <= Date.now();

// Common misspellings of the big mail domains. A typo here means the invitation
// can never match the address Google reports, and nothing says why.
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "yahoo.co": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "outlook.co": "outlook.com",
};

/**
 * What to tell the master about an address before it is saved: how it will be
 * stored, a likely domain typo, and the Gmail rule. Advice only.
 */
const inviteAddressHints = (typed: string): string[] => {
  const trimmed = typed.trim();
  if (!trimmed.includes("@")) return [];
  const normalized = trimmed.toLowerCase();
  const hints: string[] = [];
  if (normalized !== typed) hints.push(`It will be saved as ${normalized}.`);
  const domain = normalized.split("@").pop() ?? "";
  if (DOMAIN_TYPOS[domain]) hints.push(`Did you mean @${DOMAIN_TYPOS[domain]}?`);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    hints.push(
      "For Gmail, type it exactly as it appears in their Google account — dots and any +tag included. Google sends back the address as written there, and the invitation only matches that.",
    );
  }
  return hints;
};

// Mirrors public.role_rank() in 20260908074018_peer_role_management.sql. An
// account may only manage accounts below its own rank, so an equal rank is
// never manageable — and because an account holds the same rank as itself, that
// covers your own row too: an admin cannot grant itself scan or upload rights,
// and a master cannot demote or disable itself. RLS enforces the same rule; the
// checks here only keep the screen from offering an action the database refuses.
const ROLE_RANK: Record<UserRole, number> = { master: 3, admin: 2, user: 1 };

const ROLE_LABEL: Record<UserRole, string> = {
  master: "Master (Super Admin)",
  admin: "Admin (Hospital Admin)",
  user: "User (Standard Staff)",
};

// A role can only be handed to someone below your own rank, so the assignable
// roles are the ones ranking strictly below yours — a master offers Admin and
// User, never Master. Enforced in the WITH CHECK of "user_roles: masters manage
// lower ranks" (20260908075627_assign_below_own_role.sql); the list here just
// stops the screen offering what the database refuses.
//
// The consequence is deliberate: no master can be created through this screen,
// because nothing outranks a master. Appointing one is an `insert into
// user_roles` in the SQL editor, which is the migration's stated intent.
const assignableRoles = (rank: number): UserRole[] =>
  (Object.keys(ROLE_RANK) as UserRole[])
    .filter((r) => ROLE_RANK[r] < rank)
    .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);

// Shown wherever an action is withheld for that rule, so a disabled control is
// never left unexplained.
const PEER_NOTE =
  "Accounts at your own role level — your own included — can only be changed by someone above them.";

/**
 * The account state the database enforces. No permissions row means the
 * account was never activated, and user_is_enabled() treats that as disabled;
 * the old `is_enabled !== false` test showed those accounts as "Active", with
 * Scan and Upload badges, while the approval queue said they could do nothing.
 */
const accountStatus = (
  u: UserWithDetails,
): { label: string; variant: "default" | "destructive" | "secondary" } => {
  if (!u.permissions) return { label: "Pending", variant: "secondary" };
  return u.permissions.is_enabled
    ? { label: "Active", variant: "default" }
    : { label: "Disabled", variant: "destructive" };
};

const UserManagement = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { role: currentUserRole, isMaster, isAdmin, assignedHospitals: myHospitals, loading: roleLoading } = useRole();
  const { hospitals, hospitalOptions } = useHospitals();

  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithDetails | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Invitations
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("user");
  const [inviteHospitals, setInviteHospitals] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // Set while the invite dialog is editing an existing invitation, not creating one.
  const [editingInvitation, setEditingInvitation] = useState<Invitation | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Edit form state
  const [editRole, setEditRole] = useState<UserRole>("user");
  const [editHospitals, setEditHospitals] = useState<string[]>([]);
  const [editPermissions, setEditPermissions] = useState({
    can_scan: true,
    can_upload: true,
    is_enabled: true,
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch all profiles (admins can see all)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Fetch all hospital assignments
      const { data: hospitalAssignments, error: hospitalsError } = await supabase
        .from("hospital_assignments")
        .select("user_id, hospital");

      if (hospitalsError) throw hospitalsError;

      // Fetch all permissions
      const { data: permissions, error: permsError } = await supabase
        .from("user_permissions")
        .select("user_id, can_scan, can_upload, is_enabled");

      if (permsError) throw permsError;

      // Combine data
      const usersWithDetails: UserWithDetails[] = (profiles || []).map((profile) => {
        const userRoles = (roles || []).filter((r) => r.user_id === profile.id);
        const userHospitals = (hospitalAssignments || [])
          .filter((h) => h.user_id === profile.id)
          .map((h) => h.hospital);
        const userPerms = (permissions || []).find((p) => p.user_id === profile.id);

        // Determine highest role
        let highestRole: UserRole = "user";
        if (userRoles.some((r) => r.role === "master")) highestRole = "master";
        else if (userRoles.some((r) => r.role === "admin")) highestRole = "admin";
        else if (userRoles.some((r) => r.role === "staff" || r.role === "user")) highestRole = "user";

        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: highestRole,
          hospitals: userHospitals,
          // The three columns are nullable, and the database resolves a null the
          // same way it resolves a missing row: user_is_enabled() and
          // user_can_scan() both COALESCE to false. Collapsing null to false
          // here makes this table agree with what the database will actually
          // enforce — previously a null column rendered as "Active" while every
          // write it implied was refused.
          permissions: userPerms ? {
            can_scan: userPerms.can_scan ?? false,
            can_upload: userPerms.can_upload ?? false,
            is_enabled: userPerms.is_enabled ?? false,
          } : null,
        };
      });

      // Filter users based on current user's role
      let filteredUsers = usersWithDetails;
      if (!isMaster) {
        // Admins see themselves and the accounts they may manage: lower-ranked
        // staff sharing one of their hospitals, or with no hospital yet. Asked
        // of the database, because this client cannot see another hospital's
        // assignments and so cannot tell "no hospital" from "not my hospital".
        const { data: manageable, error: manageableError } = await supabase.rpc(
          "admin_manageable_user_ids",
        );
        if (manageableError) throw manageableError;
        const allowed = new Set<string>((manageable ?? []) as string[]);
        filteredUsers = usersWithDetails.filter((u) => u.id === user?.id || allowed.has(u.id));
      }

      setUsers(filteredUsers);
    } catch (error: any) {
      toast({
        title: "Error fetching users",
        description: describeError(error, 'Could not load the user list.'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitations = async () => {
    setInvitationsError(null);
    // RLS decides the scope: a master sees every open invitation, an admin sees
    // the ones covering a hospital it runs. Neither needs a filter here.
    const { data, error } = await supabase
      .from("staff_invitations")
      // "*" so the expiry and email columns come through once migration
      // 20260927140000 is applied, without breaking this read before it is.
      .select("*")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      // Deliberately not a toast. The likeliest cause by far is a build running
      // against a database where 20260908120000_staff_invitations.sql has not
      // been applied yet, and an error popup on every page load would be a
      // worse answer than one line inside the card saying so.
      setInvitationsError(describeError(error, "Could not load pending invitations."));
      setInvitations([]);
      return;
    }

    setInvitations((data || []) as Invitation[]);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchInvitations();
    }
  }, [isAdmin]);

  const refreshAll = () => {
    fetchUsers();
    fetchInvitations();
  };

  const myRank = ROLE_RANK[currentUserRole] ?? 0;

  /** True when `target` sits strictly below the signed-in account's role. */
  const canManage = (target: UserWithDetails | null): boolean =>
    target !== null && myRank > (ROLE_RANK[target.role] ?? 0);

  const openInviteDialog = () => {
    setEditingInvitation(null);
    setInviteEmail("");
    setInviteRole("user");
    setInviteHospitals([]);
    setIsInviteDialogOpen(true);
  };

  // Changing the role or hospitals of an invitation used to mean revoking it
  // and typing it all again. The address stays fixed: a different address is a
  // different person, and gets its own invitation.
  const openEditInvitation = (invite: Invitation) => {
    setEditingInvitation(invite);
    setInviteEmail(invite.email);
    setInviteRole(invite.role === "admin" ? "admin" : "user");
    setInviteHospitals(invite.hospitals);
    setIsInviteDialogOpen(true);
  };

  /**
   * Email the invitation to the person invited (send-staff-invitation). The
   * function checks the caller is an enabled master, refuses a resend within
   * two minutes, and records when it was sent.
   */
  // `announce: false` when the caller shows its own combined message.
  const emailInvitation = async (
    invitationId: string,
    address: string,
    announce = true,
  ): Promise<{ ok: boolean; reason?: string }> => {
    setEmailingId(invitationId);
    try {
      const { error } = await supabase.functions.invoke("send-staff-invitation", {
        body: { invitationId },
      });
      if (error) throw error;
      if (announce) toast({ title: "Invitation emailed", description: `Sent to ${address}.` });
      return { ok: true };
    } catch (error) {
      const reason = await describeInvokeError(error, "Could not send the email. Use Resend email to try again.");
      if (announce) {
        toast({ title: "The invitation email was not sent", description: reason, variant: "destructive" });
      }
      return { ok: false, reason };
    } finally {
      setEmailingId(null);
      fetchInvitations();
    }
  };

  const toggleInviteHospital = (hospital: string) => {
    setInviteHospitals((prev) =>
      prev.includes(hospital)
        ? prev.filter((h) => h !== hospital)
        : [...prev, hospital]
    );
  };

  /**
   * Sends an invitation — which is to say, records the decision.
   *
   * Nothing is emailed. Sign-in is Google-only, so there is no link to send
   * that the person could not reach by opening CPMS themselves; what the
   * invitation buys is that their role and hospitals are already waiting when
   * they do. handle_new_user() applies it on first sign-in.
   */
  const sendInvitation = async () => {
    // Stored lower-cased, and the database holds callers to it, so that the
    // trigger's lower(new.email) lookup can match what Google returns.
    const email = inviteEmail.trim().toLowerCase();

    // Mirrors staff_invitations_email_shape. Repeating it here is not
    // belt-and-braces for its own sake: the constraint violation comes back as
    // a 23514, which describeError() can only render as "One of the values
    // entered is not allowed" — true, and no use to whoever typed it.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast({
        title: "Check the email address",
        description: "Enter the full Google address this person will sign in with.",
        variant: "destructive",
      });
      return;
    }

    if (inviteHospitals.length === 0) {
      toast({
        title: "Pick at least one hospital",
        description: "Without one, the account can sign in but cannot see or add any records.",
        variant: "destructive",
      });
      return;
    }

    // An invitation is applied by the trigger that runs when an account is
    // created, so it does nothing at all for someone who already has one —
    // they will never sign up again. Say so, rather than leaving a row that can
    // never be taken up.
    if (!editingInvitation && users.some((u) => u.email?.toLowerCase() === email)) {
      toast({
        title: "That address already has an account",
        description: "Find them in the list below and edit their role and hospitals directly.",
        variant: "destructive",
      });
      return;
    }

    if (!editingInvitation && invitations.some((i) => i.email === email)) {
      toast({
        title: "Already invited",
        description: "There is an open invitation for that address. Use Edit on it to change or extend it.",
        variant: "destructive",
      });
      return;
    }

    setInviting(true);

    if (editingInvitation) {
      try {
        const roleToSave = inviteRole === "user" ? "staff" : inviteRole;
        // Saving an edit also gives it a fresh 30 days: an edit is someone
        // looking at it and confirming it still stands.
        const changes: { role: "staff" | "admin"; hospitals: string[]; expires_at?: string } = {
          role: roleToSave as "staff" | "admin",
          hospitals: inviteHospitals,
        };
        if (editingInvitation.expires_at !== undefined) {
          changes.expires_at = new Date(Date.now() + INVITATION_DAYS * 86_400_000).toISOString();
        }
        const { data: updated, error } = await supabase
          .from("staff_invitations")
          .update(changes)
          .eq("id", editingInvitation.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) {
          toast({
            title: "Invitation not changed",
            description: "It was accepted or revoked in the meantime. The list has been refreshed.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Invitation updated",
            description:
              changes.expires_at !== undefined
                ? `Saved, and valid for another ${INVITATION_DAYS} days. Use Resend email if they need the details again.`
                : "Saved. Use Resend email if they need the details again.",
          });
        }
        setIsInviteDialogOpen(false);
        setEditingInvitation(null);
        fetchInvitations();
      } catch (error: any) {
        toast({
          title: "Could not update the invitation",
          description: describeError(error, "Could not update the invitation. Please try again."),
          variant: "destructive",
        });
      } finally {
        setInviting(false);
      }
      return;
    }

    try {
      // The same mapping the edit dialog uses: this screen's "user" is the
      // enum's 'staff'. The enum's own 'user' is what an *uninvited* signup
      // gets, and is not invitable.
      const roleToInsert = inviteRole === "user" ? "staff" : inviteRole;

      const { data: created, error } = await supabase
        .from("staff_invitations")
        .insert({
          email,
          role: roleToInsert,
          hospitals: inviteHospitals,
          // Pinned by the insert policy too, so this is not optional.
          invited_by: user?.id,
        })
        .select("id")
        .single();

      if (error) throw error;

      setIsInviteDialogOpen(false);
      fetchInvitations();

      // The invitation is saved whatever happens to the email; a failed send
      // says so and leaves Resend email on the row.
      const sent = await emailInvitation(created.id, email, false);
      toast({
        title: sent.ok ? "Invitation created and emailed" : "Invitation created, but not emailed",
        description: sent.ok
          ? `${email} has the sign-in details. After they sign in with Google they appear under "Awaiting approval" for you to activate.`
          : `${sent.reason} The invitation is saved: tell them another way, or use Resend email.`,
        variant: sent.ok ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Could not create the invitation",
        description: describeError(error, "Could not create the invitation. Please try again."),
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  const revokeInvitation = async (invitation: Invitation) => {
    setRevokingId(invitation.id);
    try {
      // Revoked rather than deleted: the row is the only record that this
      // address was ever offered access, and by whom.
      const { error } = await supabase
        .from("staff_invitations")
        .update({ revoked_at: new Date().toISOString(), revoked_by: user?.id })
        .eq("id", invitation.id);

      if (error) throw error;

      toast({
        title: "Invitation revoked",
        description: `${invitation.email} will be treated as an ordinary new signup from now on.`,
      });
      fetchInvitations();
    } catch (error: any) {
      toast({
        title: "Could not revoke the invitation",
        description: describeError(error, "Could not revoke the invitation. Please try again."),
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  /**
   * The far end of the invitation: the account has signed in, is sitting on the
   * Pending Activation screen, and its role and hospitals are already what the
   * invitation said. Creating the permissions row is all that is left, so it
   * does not need the dialog — "Review & set up" is still there for the
   * accounts that do.
   *
   * Gated on canManage() like every other write on this screen: the upsert goes
   * to user_permissions, which RLS now restricts to targets the caller
   * outranks.
   */
  const activateUser = async (target: UserWithDetails) => {
    if (!canManage(target)) {
      toast({ title: "Not allowed", description: PEER_NOTE, variant: "destructive" });
      return;
    }

    setActivatingId(target.id);
    try {
      const { error } = await supabase.from("user_permissions").upsert(
        {
          user_id: target.id,
          can_scan: true,
          can_upload: true,
          is_enabled: true,
          updated_by: user?.id,
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      toast({
        title: "Account activated",
        description: `${target.full_name || target.email} can use CPMS now.`,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Could not activate the account",
        description: describeError(error, "Could not activate that account. Please try again."),
        variant: "destructive",
      });
    } finally {
      setActivatingId(null);
    }
  };

  const openEditDialog = (userToEdit: UserWithDetails) => {
    if (!canManage(userToEdit)) {
      toast({ title: "Not allowed", description: PEER_NOTE, variant: "destructive" });
      return;
    }
    setSelectedUser(userToEdit);
    setEditRole(userToEdit.role);
    setEditHospitals(userToEdit.hospitals);
    setEditPermissions(userToEdit.permissions || {
      can_scan: true,
      can_upload: true,
      is_enabled: true,
    });
    setIsEditDialogOpen(true);
  };

  // Only a master may change a role at all: RLS on user_roles requires it, and
  // an admin able to grant 'admin' would be minting peers it then cannot
  // manage. 'master' is on nobody's menu: assignableRoles() offers ranks
  // strictly below the caller's, and the WITH CHECK added by
  // 20260908075627_assign_below_own_role.sql refuses an equal rank at the
  // database too. A second master is granted directly in the database — there
  // is deliberately no route to one from this screen, and the comment that used
  // to sit here claimed the opposite.
  const canChangeRole = isMaster && canManage(selectedUser);

  // The roles this account may hand out: strictly below its own.
  const roleOptions = assignableRoles(myRank);

  const saveUserChanges = async () => {
    if (!selectedUser) return;

    // The dialog cannot be opened for a peer, but the role shown in the list
    // may be stale — the target may have been promoted since the last fetch.
    // Checking again here beats firing four writes for RLS to refuse one by one.
    if (!canManage(selectedUser)) {
      toast({ title: "Not allowed", description: PEER_NOTE, variant: "destructive" });
      return;
    }

    // Refuse an out-of-reach role before anything is written, rather than
    // letting the hospital and permission writes land and the role write fail.
    if (editRole !== selectedUser.role && !roleOptions.includes(editRole)) {
      toast({
        title: "Not allowed",
        description: "You can only assign a role below your own.",
        variant: "destructive",
      });
      return;
    }

    // An enabled account with no hospital signs in to an empty CPMS -- the
    // state the approval queue exists to prevent. The database refuses it too.
    if (editPermissions.is_enabled && editHospitals.length === 0) {
      toast({
        title: "Assign a hospital first",
        description: "Choose at least one hospital before enabling this account.",
        variant: "destructive",
      });
      return;
    }

    // The two changes that lock someone out of their work get a second look;
    // everything else on this dialog is easy to put back.
    const wasEnabled = selectedUser.permissions?.is_enabled === true;
    const whoName = selectedUser.full_name || selectedUser.email || "this user";
    if (wasEnabled && !editPermissions.is_enabled) {
      if (!window.confirm(`Disable ${whoName}? They will not be able to use CPMS until re-enabled.`)) return;
    } else if (selectedUser.hospitals.length > 0 && editHospitals.length === 0) {
      if (!window.confirm(`Remove all hospitals from ${whoName}? They will no longer see any patient records.`)) return;
    }

    setSaving(true);
    try {
      // One call, one transaction (admin_update_user). This used to be five
      // separate writes: deleting every visible hospital row and re-inserting
      // the list, which for a user shared with another admin's hospital deleted
      // only the caller's rows and then failed re-inserting the other's --
      // leaving the user without the caller's hospital and the rest unsaved.
      // The function touches only hospitals the caller runs, leaves the others
      // as they are, and rechecks rank and hospital scope itself.
      const { error: saveError } = await supabase.rpc("admin_update_user", {
        _target_user_id: selectedUser.id,
        _hospitals: editHospitals,
        _can_scan: editPermissions.can_scan,
        _can_upload: editPermissions.can_upload,
        _is_enabled: editPermissions.is_enabled,
        _role: editRole !== selectedUser.role && canChangeRole ? editRole : undefined,
      });

      if (saveError) {
        // The function raises 42501 with wording written for this screen
        // ("This person works only at hospitals you do not manage").
        // 22023 is the function's own "no hospital" / "hospital no longer exists".
        const code = (saveError as { code?: string }).code;
        if (code === "42501" || code === "22023") {
          toast({ title: "Not allowed", description: saveError.message, variant: "destructive" });
          return;
        }
        throw saveError;
      }

      toast({
        title: "User updated",
        description: "User settings have been saved successfully.",
      });

      setIsEditDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error saving changes",
        description: describeError(error, 'Could not save those changes. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleHospital = (hospital: string) => {
    setEditHospitals((prev) =>
      prev.includes(hospital)
        ? prev.filter((h) => h !== hospital)
        : [...prev, hospital]
    );
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case "master":
        return <Crown className="h-4 w-4" />;
      case "admin":
        return <ShieldCheck className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case "master":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const filteredUsers = users.filter((u) =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // A null `permissions` means no user_permissions row was ever created.
  // handle_new_user() creates profiles + user_roles but not permissions, and
  // user_is_enabled()/user_can_scan() both COALESCE a missing row to false — so
  // these users can sign in but cannot do anything, with nothing telling an
  // administrator they are waiting. Explicitly disabled users (is_enabled =
  // false) are a deliberate state and are not surfaced here.
  const pendingUsers = users.filter((u) => u.permissions === null);

  // useRole starts at role "user", so checking isAdmin before the role resolves
  // flashes Access Denied at every admin on page load.
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              You don&apos;t have permission to access this page.
            </p>
            <Button onClick={() => router.push(asset("/dashboard"))}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(asset("/dashboard"))} className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-primary flex items-center justify-center shrink-0">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-base sm:text-xl tracking-tight truncate">User Management</span>
          </div>
          <Badge variant={getRoleBadgeVariant(currentUserRole)} className="gap-1 shrink-0 px-2">
            {getRoleIcon(currentUserRole)}
            <span className="hidden sm:inline">{currentUserRole.toUpperCase()}</span>
          </Badge>
          {isMaster && (
            <Button onClick={openInviteDialog} size="sm" className="gap-2 shrink-0 h-9 sm:h-10">
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Invite</span>
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={refreshAll} disabled={loading} className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Card className="border-2">
              <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-4">
                <div className="h-9 w-9 sm:h-12 sm:w-12 bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold">{users.length}</p>
                  <p className="text-[11px] sm:text-sm text-muted-foreground truncate">Total Users</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-4">
                <div className="h-9 w-9 sm:h-12 sm:w-12 bg-secondary flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold">
                    {users.filter((u) => u.role === "admin").length}
                  </p>
                  <p className="text-[11px] sm:text-sm text-muted-foreground truncate">Admins</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-4">
                <div className="h-9 w-9 sm:h-12 sm:w-12 bg-accent flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold">{hospitals.length}</p>
                  <p className="text-[11px] sm:text-sm text-muted-foreground truncate">Hospitals</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Invited, not signed in yet — the first half of the onboarding flow.
              Shown to masters even when empty, because an empty list is the
              state in which someone most wants the invite button. */}
          {(isMaster || invitations.length > 0 || invitationsError) && (
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Invited, not signed in yet
                  {invitations.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{invitations.length}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Their role and hospitals are set aside and applied the first time they sign in
                  with Google. They land on the Pending Activation screen until you activate them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {invitationsError ? (
                  <p className="text-xs text-destructive">{invitationsError}</p>
                ) : invitations.length === 0 ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      No one is waiting on a first sign-in.
                    </p>
                    {isMaster && (
                      <Button size="sm" variant="outline" onClick={openInviteDialog} className="gap-2 shrink-0">
                        <UserPlus className="h-4 w-4" />
                        Invite a staff member
                      </Button>
                    )}
                  </div>
                ) : (
                  invitations.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-secondary border-2 border-border"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm break-all">{invite.email}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {invite.role === "staff" ? "USER" : invite.role.toUpperCase()}
                          </Badge>
                          {invite.hospitals.map((h) => (
                            <Badge key={h} variant="outline" className="text-[10px]">
                              {h}
                            </Badge>
                          ))}
                          <span className="text-[11px] text-muted-foreground">
                            invited {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                          </span>
                          {invite.expires_at && (
                            invitationExpired(invite) ? (
                              <Badge variant="destructive" className="text-[10px]">Expired — edit to extend</Badge>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                · expires {formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}
                              </span>
                            )
                          )}
                          {invite.expires_at !== undefined && (
                            <span className="text-[11px] text-muted-foreground">
                              ·{" "}
                              {invite.last_emailed_at
                                ? `emailed ${formatDistanceToNow(new Date(invite.last_emailed_at), { addSuffix: true })}`
                                : "not emailed yet"}
                            </span>
                          )}
                        </div>
                      </div>
                      {isMaster && (
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => emailInvitation(invite.id, invite.email)}
                            disabled={emailingId === invite.id || invitationExpired(invite)}
                            title={invitationExpired(invite) ? "Extend it first with Edit" : undefined}
                          >
                            {emailingId === invite.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Resend email
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => openEditInvitation(invite)}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => revokeInvitation(invite)}
                            disabled={revokingId === invite.id}
                          >
                            {revokingId === invite.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                            Revoke
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* Pending approval — users who signed in but were never provisioned */}
          {pendingUsers.length > 0 && (
            <Card className="border-2 border-primary">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Awaiting approval
                  <Badge variant="default" className="ml-1">{pendingUsers.length}</Badge>
                </CardTitle>
                <CardDescription>
                  These accounts have signed in but have no permissions yet, so they are sitting on
                  the Pending Activation screen and cannot reach anything. Invited accounts already
                  have the role and hospitals below — Activate is all they need.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 p-3 bg-secondary border-2 border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{u.full_name || "No name"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      {/* What the invitation already put in place. An account
                          with neither was not invited — it walked in — and
                          needs the dialog rather than one click. */}
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {u.role.toUpperCase()}
                        </Badge>
                        {u.hospitals.length > 0 ? (
                          u.hospitals.map((h) => (
                            <Badge key={h} variant="outline" className="text-[10px]">
                              {h}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[11px] text-muted-foreground">no hospital yet</span>
                        )}
                      </div>
                    </div>
                    {canManage(u) ? (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => activateUser(u)}
                          disabled={activatingId === u.id || u.hospitals.length === 0}
                          className="gap-2"
                          // Activating an account with no hospital produces
                          // exactly the state this queue exists to catch: it can
                          // sign in and still see nothing. Those go through the
                          // dialog, where a hospital can be picked.
                          title={u.hospitals.length === 0 ? "Assign a hospital first" : undefined}
                        >
                          {activatingId === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MailCheck className="h-4 w-4" />
                          )}
                          Activate
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(u)}>
                          Review
                        </Button>
                      </div>
                    ) : (
                      // A peer awaiting setup is a dead end for this account —
                      // better to say so than to offer a button that fails.
                      <span className="text-[11px] text-muted-foreground text-right shrink-0 max-w-[8rem]">
                        Needs a higher role to set up
                      </span>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Approving enables the account. Assign at least one hospital in the same dialog —
                  without one they still cannot see or add records.
                </p>
              </CardContent>
            </Card>
          )}


          {/* Search */}
          <Card className="border-2">
            <CardContent className="p-3 sm:p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 sm:h-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          {loading ? (
            <Card className="border-2">
              <CardContent className="p-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading users...</p>
              </CardContent>
            </Card>
          ) : (
            <>
            {/* Desktop Table */}
            <Card className="border-2 hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2">
                      <TableHead className="font-bold">User</TableHead>
                      <TableHead className="font-bold">Role</TableHead>
                      <TableHead className="font-bold">Hospitals</TableHead>
                      <TableHead className="font-bold">Status</TableHead>
                      <TableHead className="font-bold">Permissions</TableHead>
                      <TableHead className="font-bold w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id} className="border-b">
                        <TableCell>
                          <div>
                            <p className="font-medium">{u.full_name || "No name"}</p>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(u.role)} className="gap-1">
                            {getRoleIcon(u.role)}
                            {u.role.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.hospitals.length > 0 ? (
                              u.hospitals.map((h) => (
                                <Badge key={h} variant="outline" className="text-xs">
                                  {h}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">None</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={accountStatus(u).variant}>
                            {accountStatus(u).label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 text-xs">
                            {u.permissions?.can_scan === true && (
                              <Badge variant="outline">Scan</Badge>
                            )}
                            {u.permissions?.can_upload === true && (
                              <Badge variant="outline">Upload</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(u)}
                            disabled={!canManage(u)}
                            title={canManage(u) ? "Edit user" : PEER_NOTE}
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filteredUsers.length === 0 ? (
                <Card className="border-2">
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No users found</p>
                  </CardContent>
                </Card>
              ) : filteredUsers.map((u) => {
                const editable = canManage(u);
                return (
                  <Card
                    key={u.id}
                    className={`border-2 ${editable ? "active:scale-[0.99] cursor-pointer" : "opacity-90"}`}
                    onClick={() => editable && openEditDialog(u)}
                  >
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="h-11 w-11 bg-secondary flex items-center justify-center shrink-0 rounded-md">
                          {getRoleIcon(u.role)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{u.full_name || "No name"}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Badge variant={getRoleBadgeVariant(u.role)} className="gap-1 shrink-0 text-[10px] px-2">
                          {u.role.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={accountStatus(u).variant}
                          className="text-[10px]"
                        >
                          {accountStatus(u).label}
                        </Badge>
                        {u.permissions?.can_scan === true && (
                          <Badge variant="outline" className="text-[10px]">Scan</Badge>
                        )}
                        {u.permissions?.can_upload === true && (
                          <Badge variant="outline" className="text-[10px]">Upload</Badge>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase mb-1">Hospitals</p>
                        <div className="flex flex-wrap gap-1">
                          {u.hospitals.length > 0 ? (
                            u.hospitals.map((h) => (
                              <Badge key={h} variant="outline" className="text-[10px]">
                                {h}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">None assigned</span>
                          )}
                        </div>
                      </div>

                      {editable && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 h-10"
                          onClick={(e) => { e.stopPropagation(); openEditDialog(u); }}
                        >
                          <UserCog className="h-4 w-4" />
                          Edit
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">{PEER_NOTE}</p>
            </>
          )}
        </div>
      </main>

      {/* Invite Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[calc(100%-1.5rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>{editingInvitation ? "Edit invitation" : "Invite a staff member"}</DialogTitle>
            <DialogDescription>
              {editingInvitation
                ? `Change what ${editingInvitation.email} gets when they sign in. Saving also extends the invitation for another ${INVITATION_DAYS} days.`
                : "Choose what they get before they arrive. It is applied the first time they sign in with Google, and takes effect when you activate the account."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="inviteEmail">Google email address</Label>
              <Input
                id="inviteEmail"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-11 sm:h-10"
                disabled={!!editingInvitation}
              />
              <p className="text-xs text-muted-foreground">
                {editingInvitation
                  ? "The address can't be changed — a different address is a different person. Revoke this one and invite the new address instead."
                  : "It has to be the address they sign in to Google with — CPMS has no other way to recognise them."}
              </p>
              {!editingInvitation &&
                inviteAddressHints(inviteEmail).map((hint) => (
                  <p key={hint} className="text-xs text-yellow-700">
                    {hint}
                  </p>
                ))}
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* The same list the edit dialog offers: roles strictly below
                      your own. Only a master can reach this dialog, so today
                      that is exactly Admin and User — but deriving it means the
                      invite path cannot drift from the rank rule if the insert
                      policy is ever loosened to let admins invite. */}
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(r)}
                        {ROLE_LABEL[r]}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Master is absent for a second, independent reason, and the
                  CHECK on staff_invitations.role refuses it as well: the
                  acceptance trigger is SECURITY DEFINER, so it writes the
                  invited role without any rank test at all. An account that
                  arrived already holding 'master' would have no permissions row
                  and nobody outranking it to create one — it could open CPMS
                  and never save a record. */}
              <p className="text-xs text-muted-foreground">
                A master cannot be invited: nothing outranks one, so nobody could ever activate the
                account. Promoting one here is refused as well — a role has to rank below
                your own, in this dialog and in the database. A second master is granted directly
                in the database.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Hospitals</Label>
              <div className="flex flex-wrap gap-2">
                {hospitalOptions.map((h) => {
                  const isAssigned = inviteHospitals.includes(h.value);
                  return (
                    <Button
                      key={h.value}
                      variant={isAssigned ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleInviteHospital(h.value)}
                      className="gap-1"
                    >
                      {isAssigned ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {h.label}
                    </Button>
                  );
                })}
              </div>
              {hospitalOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hospitals configured yet. Add one under Hospital Management first.
                </p>
              )}
            </div>

            <div className="border-l-4 border-primary bg-accent/40 px-4 py-3 text-xs leading-relaxed">
              {editingInvitation
                ? "The person is not emailed about an edit. Use Resend email on the invitation if they need the new details."
                : `They are emailed a link to CPMS and told to sign in with Google using this exact address. The invitation stays open for ${INVITATION_DAYS} days. It does not switch the account on: they land on a Pending Activation screen, and you activate them from the queue on this page.`}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendInvitation} disabled={inviting} className="gap-2">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {editingInvitation ? "Save changes" : "Invite and email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[calc(100%-1.5rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Role */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as UserRole)}
                disabled={!canChangeRole}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(r)}
                        {ROLE_LABEL[r]}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canChangeRole ? (
                <p className="text-xs text-muted-foreground">
                  {isMaster ? PEER_NOTE : "Only a master administrator can change a role."}
                </p>
              ) : (
                // Explain the option that is missing rather than leave a master
                // hunting for it: promotion to your own level is not available
                // to anyone, by design.
                <p className="text-xs text-muted-foreground">
                  Only roles below your own can be assigned, so {ROLE_LABEL[currentUserRole]} is
                  not offered here.
                </p>
              )}
            </div>

            {/* Hospital Assignments */}
            <div className="space-y-2">
              <Label>Assigned Hospitals</Label>
              <div className="flex flex-wrap gap-2">
                {hospitalOptions.map((h) => {
                  const isAssigned = editHospitals.includes(h.value);
                  const canAssign = isMaster || myHospitals.includes(h.value);
                  return (
                    <Button
                      key={h.value}
                      variant={isAssigned ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleHospital(h.value)}
                      disabled={!canAssign}
                      className="gap-1"
                    >
                      {isAssigned ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {h.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-4">
              <Label>Permissions</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Account Enabled</p>
                    <p className="text-sm text-muted-foreground">Allow user to access the system</p>
                  </div>
                  <Switch
                    checked={editPermissions.is_enabled}
                    onCheckedChange={(v) =>
                      setEditPermissions((p) => ({ ...p, is_enabled: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Can Scan Prescriptions</p>
                    <p className="text-sm text-muted-foreground">Allow scanning and OCR extraction</p>
                  </div>
                  <Switch
                    checked={editPermissions.can_scan}
                    onCheckedChange={(v) =>
                      setEditPermissions((p) => ({ ...p, can_scan: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Can Upload Documents</p>
                    <p className="text-sm text-muted-foreground">Allow uploading additional documents</p>
                  </div>
                  <Switch
                    checked={editPermissions.can_upload}
                    onCheckedChange={(v) =>
                      setEditPermissions((p) => ({ ...p, can_upload: v }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveUserChanges} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="h-4" />
    </div>
  );
};

export default UserManagement;

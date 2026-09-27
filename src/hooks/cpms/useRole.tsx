"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabase/cpms-client";
import { describeError } from "@/lib/cpms/errors";
import { useAuth } from "./useAuth";

export type UserRole = "master" | "admin" | "user";

interface UserPermissions {
  can_scan: boolean;
  can_upload: boolean;
  is_enabled: boolean;
}

interface HospitalAssignment {
  hospital: string;
}

interface UseRoleReturn {
  role: UserRole;
  loading: boolean;
  isMaster: boolean;
  isAdmin: boolean;
  isUser: boolean;
  permissions: UserPermissions | null;
  /**
   * Whether a `user_permissions` row exists at all, as opposed to one whose
   * columns are false. `permissions` cannot answer this -- it COALESCEs a
   * missing row to all-false the way the database does -- and the pending
   * screen has to tell "nobody has set you up yet" apart from "an
   * administrator switched you off".
   */
  hasPermissionsRow: boolean;
  /**
   * Set when the role or permissions read *failed*, as opposed to coming back
   * empty. Both fail closed, but they are not the same thing to say to
   * somebody: a blip must not be reported as "your administrator has not
   * activated you yet".
   */
  error: string | null;
  assignedHospitals: string[];
  canAccessHospital: (hospital: string) => boolean;
  canScan: boolean;
  refetch: () => Promise<void>;
}

// Role data is provider-backed rather than fetched per component: it costs one
// RPC plus two selects, and six components consume it. As a bare hook each of
// them issued its own copy on every mount.
const RoleContext = createContext<UseRoleReturn | undefined>(undefined);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  // Keyed on the id, not the object: an auth event for the same account must
  // never send the role check (and with it every route guard) back to loading.
  const userId = user?.id ?? null;
  const [role, setRole] = useState<UserRole>("user");
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [hasPermissionsRow, setHasPermissionsRow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedHospitals, setAssignedHospitals] = useState<string[]>([]);

  const fetchRoleData = useCallback(async () => {
    if (!userId) {
      setRole("user");
      setPermissions(null);
      setHasPermissionsRow(false);
      setError(null);
      setAssignedHospitals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Fetch user role using the database function
      const { data: roleData, error: roleError } = await supabase
        .rpc("get_user_role", { _user_id: userId });

      if (roleError) {
        console.error("Error fetching role:", roleError);
        // Placement depends on this answer, so a failure has to be visible.
        // Defaulting to "user" and carrying on is what sent an administrator
        // to the staff dashboard on a bad network.
        setError(describeError(roleError, "Could not read your role."));
      } else {
        setRole((roleData as UserRole) || "user");
      }

      // Fetch permissions
      const { data: permData, error: permError } = await supabase
        .from("user_permissions")
        .select("can_scan, can_upload, is_enabled")
        .eq("user_id", userId)
        .maybeSingle();

      if (permError) {
        console.error("Error fetching permissions:", permError);
        // Same reasoning, and this one decides the pending screen. Leaving
        // `permissions` null still fails closed; what changes is that the
        // guards can now say "we could not check" instead of asserting that an
        // administrator has not activated the account.
        setError(describeError(permError, "Could not read your permissions."));
      } else {
        // Deny by default when no user_permissions row exists. handle_new_user()
        // creates profiles + user_roles but NOT user_permissions, so every new
        // signup lands here. user_is_enabled()/user_can_scan() both COALESCE to
        // false for a missing row, so assuming `true` here let the UI offer
        // actions the database then refused at save time.
        //
        // The columns are individually nullable too, and the database COALESCEs
        // those to false as well — so each one falls back on its own rather than
        // the row as a whole. Reading a null as anything but false would put the
        // UI back out of step with what the database enforces.
        setPermissions({
          can_scan: permData?.can_scan ?? false,
          can_upload: permData?.can_upload ?? false,
          is_enabled: permData?.is_enabled ?? false,
        });
        setHasPermissionsRow(permData !== null);
      }

      // Fetch hospital assignments
      const { data: hospitalData, error: hospitalError } = await supabase
        .from("hospital_assignments")
        .select("hospital")
        .eq("user_id", userId);

      if (hospitalError) {
        console.error("Error fetching hospital assignments:", hospitalError);
      } else {
        setAssignedHospitals((hospitalData || []).map((h: HospitalAssignment) => h.hospital));
      }
    } catch (caught) {
      console.error("Error in useRole:", caught);
      setError(describeError(caught, "Could not load your access."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRoleData();
  }, [fetchRoleData]);

  const isMaster = role === "master";
  const isAdmin = role === "admin" || role === "master";
  const isUser = role === "user";

  const canAccessHospital = useCallback(
    (hospital: string): boolean => {
      if (isMaster) return true;
      return assignedHospitals.includes(hospital);
    },
    [isMaster, assignedHospitals]
  );

  // Explicit `=== true` so a null `permissions` (fetch failed, or still loading)
  // fails closed rather than reading as allowed.
  const canScan = permissions?.can_scan === true && permissions?.is_enabled === true;

  const value = useMemo<UseRoleReturn>(
    () => ({
      role,
      loading,
      isMaster,
      isAdmin,
      isUser,
      permissions,
      hasPermissionsRow,
      error,
      assignedHospitals,
      canAccessHospital,
      canScan,
      refetch: fetchRoleData,
    }),
    [
      role,
      loading,
      isMaster,
      isAdmin,
      isUser,
      permissions,
      hasPermissionsRow,
      error,
      assignedHospitals,
      canAccessHospital,
      canScan,
      fetchRoleData,
    ]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

export const useRole = (): UseRoleReturn => {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
};

export default useRole;

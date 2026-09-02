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
  const [role, setRole] = useState<UserRole>("user");
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [assignedHospitals, setAssignedHospitals] = useState<string[]>([]);

  const fetchRoleData = useCallback(async () => {
    if (!user) {
      setRole("user");
      setPermissions(null);
      setAssignedHospitals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch user role using the database function
      const { data: roleData, error: roleError } = await supabase
        .rpc("get_user_role", { _user_id: user.id });

      if (roleError) {
        console.error("Error fetching role:", roleError);
      } else {
        setRole((roleData as UserRole) || "user");
      }

      // Fetch permissions
      const { data: permData, error: permError } = await supabase
        .from("user_permissions")
        .select("can_scan, can_upload, is_enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      if (permError) {
        console.error("Error fetching permissions:", permError);
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
      }

      // Fetch hospital assignments
      const { data: hospitalData, error: hospitalError } = await supabase
        .from("hospital_assignments")
        .select("hospital")
        .eq("user_id", user.id);

      if (hospitalError) {
        console.error("Error fetching hospital assignments:", hospitalError);
      } else {
        setAssignedHospitals((hospitalData || []).map((h: HospitalAssignment) => h.hospital));
      }
    } catch (error) {
      console.error("Error in useRole:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

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

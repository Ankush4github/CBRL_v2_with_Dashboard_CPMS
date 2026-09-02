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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cpms-client";
import { useToast } from "@/hooks/cpms/use-toast";
import { describeError } from "@/lib/cpms/errors";
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
        // Admins can only see users assigned to their hospitals
        filteredUsers = usersWithDetails.filter((u) => {
          if (u.role === "master") return false; // Admins can't see masters
          if (u.role === "admin" && u.id !== user?.id) return false; // Admins can't see other admins
          return true;
        });
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

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const openEditDialog = (userToEdit: UserWithDetails) => {
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

  const canEditRole = (targetRole: UserRole): boolean => {
    if (isMaster) return true;
    if (targetRole === "master") return false;
    if (targetRole === "admin") return false;
    return true;
  };

  const canAssignRole = (newRole: UserRole): boolean => {
    if (isMaster) return true;
    if (newRole === "master") return false;
    if (newRole === "admin") return false;
    return true;
  };

  const saveUserChanges = async () => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      // Update role if changed and allowed
      if (editRole !== selectedUser.role && canAssignRole(editRole)) {
        // Delete existing roles
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", selectedUser.id);

        // Insert new role
        const roleToInsert = editRole === "user" ? "staff" : editRole;
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: selectedUser.id, role: roleToInsert });

        if (roleError) throw roleError;
      }

      // Update hospital assignments
      // Delete existing
      await supabase
        .from("hospital_assignments")
        .delete()
        .eq("user_id", selectedUser.id);

      // Insert new
      if (editHospitals.length > 0) {
        const hospitalInserts = editHospitals.map((h) => ({
          user_id: selectedUser.id,
          hospital: h,
          assigned_by: user?.id,
        }));

        const { error: hospitalsError } = await supabase
          .from("hospital_assignments")
          .insert(hospitalInserts);

        if (hospitalsError) throw hospitalsError;
      }

      // Upsert permissions
      const { error: permsError } = await supabase
        .from("user_permissions")
        .upsert(
          {
            user_id: selectedUser.id,
            can_scan: editPermissions.can_scan,
            can_upload: editPermissions.can_upload,
            is_enabled: editPermissions.is_enabled,
            updated_by: user?.id,
          },
          { onConflict: "user_id" }
        );

      if (permsError) throw permsError;

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
              You don't have permission to access this page.
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
          <Button variant="outline" size="icon" onClick={fetchUsers} disabled={loading} className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
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
                  These accounts have signed in but have no permissions yet, so they cannot access
                  anything. Set them up to grant access.
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
                    </div>
                    <Button size="sm" onClick={() => openEditDialog(u)} className="shrink-0">
                      Review &amp; set up
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Approving enables the account. Assign at least one hospital in the same dialog —
                  without one they still cannot see or add records.
                </p>
              </CardContent>
            </Card>
          )}

          {!isMaster && pendingUsers.length === 0 && (
            <Card className="border-2 border-dashed">
              <CardContent className="p-4 text-xs text-muted-foreground">
                New accounts are only visible to master administrators until a hospital is assigned,
                so any users awaiting first-time approval will not appear here.
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
                          <Badge variant={u.permissions?.is_enabled !== false ? "default" : "destructive"}>
                            {u.permissions?.is_enabled !== false ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 text-xs">
                            {u.permissions?.can_scan !== false && (
                              <Badge variant="outline">Scan</Badge>
                            )}
                            {u.permissions?.can_upload !== false && (
                              <Badge variant="outline">Upload</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(u)}
                            disabled={!canEditRole(u.role) && u.id !== user?.id}
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
                const editable = canEditRole(u.role) || u.id === user?.id;
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
                          variant={u.permissions?.is_enabled !== false ? "default" : "destructive"}
                          className="text-[10px]"
                        >
                          {u.permissions?.is_enabled !== false ? "Active" : "Disabled"}
                        </Badge>
                        {u.permissions?.can_scan !== false && (
                          <Badge variant="outline" className="text-[10px]">Scan</Badge>
                        )}
                        {u.permissions?.can_upload !== false && (
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
            </>
          )}
        </div>
      </main>

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
                disabled={!canEditRole(selectedUser?.role || "user")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user" disabled={!canAssignRole("user")}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      User (Standard Staff)
                    </div>
                  </SelectItem>
                  <SelectItem value="admin" disabled={!canAssignRole("admin")}>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Admin (Hospital Admin)
                    </div>
                  </SelectItem>
                  {isMaster && (
                    <SelectItem value="master">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4" />
                        Master (Super Admin)
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
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

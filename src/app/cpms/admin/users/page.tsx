import { ProtectedRoute, RoleRoute } from "@/components/cpms/guards";
import UserManagement from "@/components/cpms/pages/UserManagement";

export default function Page() {
  return (
    <ProtectedRoute>
      <RoleRoute requires="admin">
        <UserManagement />
      </RoleRoute>
    </ProtectedRoute>
  );
}
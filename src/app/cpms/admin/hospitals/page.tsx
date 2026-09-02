import { ProtectedRoute, RoleRoute } from "@/components/cpms/guards";
import HospitalManagement from "@/components/cpms/pages/HospitalManagement";

export default function Page() {
  return (
    <ProtectedRoute>
      <RoleRoute requires="master">
        <HospitalManagement />
      </RoleRoute>
    </ProtectedRoute>
  );
}
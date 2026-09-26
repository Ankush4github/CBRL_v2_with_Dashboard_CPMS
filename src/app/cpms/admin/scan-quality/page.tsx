import { ProtectedRoute, RoleRoute } from "@/components/cpms/guards";
import ScanQuality from "@/components/cpms/pages/ScanQuality";

export default function Page() {
  return (
    <ProtectedRoute>
      <RoleRoute requires="admin">
        <ScanQuality />
      </RoleRoute>
    </ProtectedRoute>
  );
}

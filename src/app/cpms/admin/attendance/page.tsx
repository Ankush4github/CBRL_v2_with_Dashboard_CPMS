import { ProtectedRoute, RoleRoute } from "@/components/cpms/guards";
import AttendanceReports from "@/components/cpms/pages/AttendanceReports";

export default function Page() {
  return (
    <ProtectedRoute>
      <RoleRoute requires="admin">
        <AttendanceReports />
      </RoleRoute>
    </ProtectedRoute>
  );
}
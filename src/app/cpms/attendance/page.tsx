import { ProtectedRoute } from "@/components/cpms/guards";
import Attendance from "@/components/cpms/pages/Attendance";

export default function Page() {
  return (
    <ProtectedRoute>
      <Attendance />
    </ProtectedRoute>
  );
}
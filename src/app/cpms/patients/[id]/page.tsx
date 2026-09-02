import { ProtectedRoute } from "@/components/cpms/guards";
import PatientDetail from "@/components/cpms/pages/PatientDetail";

export default function Page() {
  return (
    <ProtectedRoute>
      <PatientDetail />
    </ProtectedRoute>
  );
}
import { ProtectedRoute } from "@/components/cpms/guards";
import PatientTimeline from "@/components/cpms/pages/PatientTimeline";

export default function Page() {
  return (
    <ProtectedRoute>
      <PatientTimeline />
    </ProtectedRoute>
  );
}
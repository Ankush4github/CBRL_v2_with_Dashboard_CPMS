import { ProtectedRoute } from "@/components/cpms/guards";
import Patients from "@/components/cpms/pages/Patients";

export default function Page() {
  return (
    <ProtectedRoute>
      <Patients />
    </ProtectedRoute>
  );
}
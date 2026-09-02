import { ProtectedRoute } from "@/components/cpms/guards";
import ScanPrescription from "@/components/cpms/pages/ScanPrescription";

export default function Page() {
  return (
    <ProtectedRoute>
      <ScanPrescription />
    </ProtectedRoute>
  );
}
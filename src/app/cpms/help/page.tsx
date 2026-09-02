import { ProtectedRoute } from "@/components/cpms/guards";
import Help from "@/components/cpms/pages/Help";

export default function Page() {
  return (
    <ProtectedRoute>
      <Help />
    </ProtectedRoute>
  );
}
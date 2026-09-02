import { ProtectedRoute } from "@/components/cpms/guards";
import Dashboard from "@/components/cpms/pages/Dashboard";

export default function Page() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
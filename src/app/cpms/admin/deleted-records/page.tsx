import { ProtectedRoute, RoleRoute } from "@/components/cpms/guards";
import DeletedRecords from "@/components/cpms/pages/DeletedRecords";

export default function Page() {
  return (
    <ProtectedRoute>
      <RoleRoute requires="master">
        <DeletedRecords />
      </RoleRoute>
    </ProtectedRoute>
  );
}

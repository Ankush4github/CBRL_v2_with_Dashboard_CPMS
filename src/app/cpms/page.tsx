import { PublicRoute } from "@/components/cpms/guards";
import Login from "@/components/cpms/pages/Login";

export default function Page() {
  return (
    <PublicRoute>
      <Login />
    </PublicRoute>
  );
}
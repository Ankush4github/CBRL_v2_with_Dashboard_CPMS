import { PendingRoute } from "@/components/cpms/guards";
import PendingActivation from "@/components/cpms/pages/PendingActivation";

export default function Page() {
  return (
    <PendingRoute>
      <PendingActivation />
    </PendingRoute>
  );
}

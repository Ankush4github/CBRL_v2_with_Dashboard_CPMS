import { OnboardingRoute } from "@/components/cpms/guards";
import Onboarding from "@/components/cpms/pages/Onboarding";

export default function Page() {
  return (
    <OnboardingRoute>
      <Onboarding />
    </OnboardingRoute>
  );
}
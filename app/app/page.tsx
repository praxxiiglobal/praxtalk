import { Inbox } from "./_components/Inbox";
import { OnboardingChecklist } from "./_components/OnboardingChecklist";

export default function AppPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OnboardingChecklist />
      <Inbox />
    </div>
  );
}

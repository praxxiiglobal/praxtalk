import { Inbox } from "./Inbox";
import { OnboardingChecklist } from "./OnboardingChecklist";

export default function AppPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OnboardingChecklist />
      <Inbox />
    </div>
  );
}

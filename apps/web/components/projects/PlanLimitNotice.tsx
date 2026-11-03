import type { Plan } from "@askwell/shared";
import { Button } from "../ui";
import { limitPrompt } from "./limit";

/** Shown inline when creating a project hits the plan's project limit. */
export function PlanLimitNotice({ plan }: { plan: Plan }) {
  const { message, upgrade } = limitPrompt(plan);
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-control border border-line-strong bg-glass p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-fg">{message}</p>
      {upgrade ? (
        <Button href="/dashboard/billing" size="sm" className="self-start sm:self-auto">
          Upgrade to Pro
        </Button>
      ) : null}
    </div>
  );
}

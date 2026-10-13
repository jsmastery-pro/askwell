import Link from "next/link";
import { DASHBOARD_HOME } from "../../components/dashboard-nav/routes";
import { EmptyState } from "../../components/ui/EmptyState";
import { BUTTON_PRIMARY } from "../../components/ui/styles";

// A project that doesn't exist and one owned by someone else both land here (§9).
export default function DashboardNotFound() {
  return (
    <EmptyState
      title="We couldn't find that page"
      action={
        <Link href={DASHBOARD_HOME} className={BUTTON_PRIMARY}>
          Back to Projects
        </Link>
      }
    >
      It may have been deleted, or the link is wrong.
    </EmptyState>
  );
}

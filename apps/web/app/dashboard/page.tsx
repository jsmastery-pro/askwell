import { redirect } from "next/navigation";
import { DASHBOARD_HOME } from "../../components/dashboard-nav/routes";

// Projects is the dashboard's home. Sign-in still lands on /dashboard, so send it on.
export default function DashboardPage() {
  redirect(DASHBOARD_HOME);
}

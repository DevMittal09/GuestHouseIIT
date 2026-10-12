import { redirect } from "next/navigation";
import { getWorkflowConsoleData } from "@/app/actions/workflow";
import { WorkflowManager } from "@/components/admin/workflow-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";

export default async function AdminWorkflowPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "workflow")) redirect("/admin/users");

  // A result rather than a throw: a missing settings table should say so
  // here, not replace the console with an error page.
  const result = await getWorkflowConsoleData();
  if (!result.ok) {
    return (
      <div className="border-l-4 border-saffron bg-notice p-4 text-sm text-ink">
        <p className="font-medium">The approval workflow is not available yet</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }
  // Keyed on the saved routes: after a save the page refreshes and the editor
  // starts again from them rather than keeping a draft of the old ones.
  return <WorkflowManager key={JSON.stringify(result.data.rules)} data={result.data} />;
}

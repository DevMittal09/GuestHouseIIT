import { redirect } from "next/navigation";
import { listProjectsForConsole } from "@/app/actions/projects";
import { ProjectsManager } from "@/components/admin/projects-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";

export default async function AdminProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "projects")) redirect("/admin/users");

  const result = await listProjectsForConsole();
  if (!result.ok) {
    return (
      <div className="border-l-4 border-saffron bg-notice p-4 text-sm text-ink">
        <p className="font-medium">Projects are not available yet</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }
  return <ProjectsManager projects={result.projects} />;
}

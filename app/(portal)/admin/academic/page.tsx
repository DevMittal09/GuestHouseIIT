import { redirect } from "next/navigation";
import { listInstituteRecordsForConsole } from "@/app/actions/academic";
import { AcademicRecordsManager } from "@/components/admin/academic-records-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";

export default async function AdminAcademicPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "academic")) redirect("/admin/users");

  const result = await listInstituteRecordsForConsole("student");
  if (!result.ok) {
    return (
      <div className="border-l-4 border-saffron bg-notice p-4 text-sm text-ink">
        <p className="font-medium">Institute records are not available yet</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }
  return <AcademicRecordsManager initialKind="student" initialRecords={result.records} />;
}

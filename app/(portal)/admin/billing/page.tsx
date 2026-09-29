import { redirect } from "next/navigation";
import { listTariffsForConsole } from "@/app/actions/invoices";
import { BillingManager } from "@/components/admin/billing-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";
import { toInstituteDateValue } from "@/lib/tz";

export default async function AdminBillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "billing")) redirect("/admin/users");

  const result = await listTariffsForConsole();
  if (!result.ok) {
    return (
      <div className="border-l-4 border-saffron bg-notice p-4 text-sm text-ink">
        <p className="font-medium">Tariffs &amp; Invoicing is not available yet</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }
  const [rules, guestHouses] = await Promise.all([getRules(), getStore().listGuestHouses()]);
  return (
    <BillingManager
      rules={rules.invoice}
      tariffs={result.tariffs}
      guestHouses={guestHouses.map((g) => ({ id: g.id, name: g.name }))}
      today={toInstituteDateValue(new Date())}
    />
  );
}

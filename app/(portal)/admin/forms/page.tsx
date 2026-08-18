import { FormConfigEditor } from "@/components/admin/form-config-editor";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { getStore } from "@/lib/store";
import { REQUESTER_ROLES } from "@/lib/types";
import type { RoleFormConfig } from "@/lib/form-config";
import type { Role } from "@/lib/types";

export default async function AdminFormsPage() {
  const guestHouses = await getStore().listGuestHouses();
  const configs: Partial<Record<Role, RoleFormConfig>> = {};
  for (const role of REQUESTER_ROLES) {
    configs[role] = await getEffectiveFormConfig(role);
  }
  return <FormConfigEditor initialConfigs={configs} guestHouses={guestHouses} />;
}

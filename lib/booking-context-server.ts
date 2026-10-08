import { cache } from "react";
import { bookingTypesFor } from "./booking-types";
import { debitHeadsByType, type DebitHeadsByType } from "./debit-heads";
import { describeProject, type Project } from "./projects";
import { getRules } from "./settings-server";
import type { Rules } from "./settings";
import { getStore } from "./store";
import type { Tariff } from "./tariffs";
import type { Profile } from "./types";
import { hodApproversFor, type Unit } from "./units";

/**
 * Everything the booking form and `createBooking` need to judge a request
 * beyond the form config: the Settings, the debitable heads this requester may
 * use per booking type (room and dining), the active projects, and who would
 * give HOD approval. Built once, here, and used by both - so what the form
 * offers and what the server accepts come from one computation.
 *
 * Never throws: a missing table degrades to the defaults and empty lists.
 */
export type BookingContext = {
  rules: Rules;
  units: Unit[];
  debitHeads: { room: DebitHeadsByType; dining: DebitHeadsByType };
  /** Active projects, for the Project head. */
  projects: { id: string; label: string }[];
  /** Everything on the project list, for resolving the chosen one. */
  allProjects: Project[];
  /** Who gives this requester HOD approval, by name - shown on the form. */
  hodApprovers: string[];
  /**
   * The rate sheet, for the table of charges on the booking form (7 Oct
   * 2026). Empty where migration 19 has not been applied, which the form
   * reads as "no rates published" rather than as an error.
   */
  tariffs: Tariff[];
};

export const bookingContextFor = cache(async (user: Profile): Promise<BookingContext> => {
  const store = getStore();
  const [rules, units, allProjects, profiles, tariffs] = await Promise.all([
    getRules(),
    store.listUnits().catch(() => [] as Unit[]),
    store.listProjects().catch(() => [] as Project[]),
    store.listProfiles().catch(() => [] as Profile[]),
    store.listTariffs().catch(() => [] as Tariff[]),
  ]);
  const types = bookingTypesFor(user.role);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return {
    rules,
    units,
    debitHeads: {
      room: debitHeadsByType(user.role, types, user, units, rules.debit, "room"),
      dining: debitHeadsByType(user.role, types, user, units, rules.debit, "dining"),
    },
    projects: allProjects
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, label: describeProject(p) })),
    allProjects,
    hodApprovers: hodApproversFor(user, units)
      .map((id) => byId.get(id)?.full_name)
      .filter((name): name is string => Boolean(name)),
    tariffs,
  };
});

import { bookingTypesFor, defaultBookingTypeFor } from "./booking-types";
import {
  describeApprover,
  hostelWardenCopyIds,
  stageApproverIds,
  type ApprovalRules,
  type ApprovalStage,
} from "./approval-routes";
import { approvalStageDetailsFor, asksOfficeApproval } from "./workflow";
import { hodApproversFor } from "./units";
import { clubsBookableBy } from "./club-booking";
import { isHostelWardenRole, ROLE_LABELS, type Profile, type Role } from "./types";
import type { Unit } from "./units";

/**
 * **The account picker's catalogue** - which kind of user each account is,
 * and the route a request from it actually takes.
 *
 * Mock Authentication (`/mock-login`) exists so every workflow can be walked
 * end to end, and a flat list of forty accounts is not that: the office asked
 * for one account per *kind* of user, chosen by kind. So this module answers
 * two questions, both **derived rather than written down**:
 *
 * 1. {@link personaGroupFor} - which of the seven groups an account belongs
 *    in. From its role, so an account the office adds later lands somewhere
 *    sensible with nobody editing a list.
 * 2. {@link personaRoute} - the chain a room booking from that account would
 *    take **under the routes currently configured**, with the real people
 *    named at each stage, and who would be copied. Read from
 *    `approvalStageDetailsFor` and `stageApproverIds`, the same functions
 *    that route the request, so the picker cannot promise a chain the portal
 *    would not follow. Edit the chain at Console -> Approval Workflow and
 *    this page says the new one.
 *
 * Pure: no store, no `server-only`. The page loads the directory once and
 * hands it in, and the tests need nothing.
 */

// ------------------------------------------------------------- the groups

export const PERSONA_GROUPS = [
  {
    id: "students",
    title: "Students",
    blurb:
      "A personal stay for family, at Bageshri, with no meals. Their hostel decides where it goes first.",
  },
  {
    id: "faculty-staff",
    title: "Faculty and staff",
    blurb:
      "Official bookings go through the HOD of their department; a personal stay goes straight to the desk.",
  },
  {
    id: "offices",
    title: "Institute offices",
    blurb:
      "Whitelisted office mailboxes. Each books direct, or through its own HOD where one is appointed.",
  },
  {
    id: "student-bodies",
    title: "Clubs and councils",
    blurb:
      "A club account cannot submit. Its Faculty Advisor books for it, and that goes straight to the desk.",
  },
  {
    id: "hostel-wardens",
    title: "Hostel wardens",
    blurb:
      "The Assistant Warden decides their hostel's student requests; the Warden and Deputy Warden are copied.",
  },
  {
    id: "desk",
    title: "The guest house desk",
    blurb:
      "The manager allocates rooms and runs the console; the caretaker runs reception.",
  },
  {
    id: "other",
    title: "Other accounts",
    blurb: "Everything the groups above do not describe.",
  },
] as const;

export type PersonaGroupId = (typeof PERSONA_GROUPS)[number]["id"];

export function personaGroup(id: string): (typeof PERSONA_GROUPS)[number] | null {
  return PERSONA_GROUPS.find((g) => g.id === id) ?? null;
}

const GROUP_FOR_ROLE: Record<Role, PersonaGroupId> = {
  student: "students",
  employee: "faculty-staff",
  official: "offices",
  // The IAR Office and the IAR Student Cell are office mailboxes that also
  // approve; they sit with the offices rather than in a group of two.
  iar_cell: "offices",
  iar_student_cell: "offices",
  club: "student-bodies",
  faculty_advisor: "student-bodies",
  warden: "hostel-wardens",
  deputy_warden: "hostel-wardens",
  assistant_warden: "hostel-wardens",
  gh_manager: "desk",
  gh_caretaker: "desk",
  developer: "desk",
  alumni: "other",
};

export function personaGroupFor(profile: Pick<Profile, "role">): PersonaGroupId {
  return GROUP_FOR_ROLE[profile.role] ?? "other";
}

/** Every group that has at least one account, in the order above. */
export function personaGroupsPresent(
  profiles: Pick<Profile, "role">[]
): (typeof PERSONA_GROUPS)[number][] {
  const present = new Set(profiles.map(personaGroupFor));
  return PERSONA_GROUPS.filter((g) => present.has(g.id));
}

// -------------------------------------------------------------- the route

export type PersonaRoute = {
  /** The chain in order, ending at the desk. Empty when the account cannot book. */
  chain: string[];
  /**
   * The other chain an **office** takes, where the form asks it Direct or
   * Requires HOD approval (`asksOfficeApproval`). Null where it is not
   * asked - the Director's Office, which has no HOD at all.
   */
  ifHodApproval: string[] | null;
  /** Who is copied on the staff mail about it, by name. */
  copiedTo: string[];
  /** Why there is no chain, where there is none. */
  cannotBook: string | null;
  /** What this account decides for other people, where it decides anything. */
  decides: string | null;
  /** Clubs and councils this account books for as their Faculty Advisor. */
  advisorFor: string[];
};

const DESK = "Guest House Manager";

function nameOf(profiles: Pick<Profile, "id" | "full_name">[], id: string): string | null {
  return profiles.find((p) => p.id === id)?.full_name ?? null;
}

/**
 * The chain a room booking from this account would take right now.
 *
 * `booking_type` is the role's own default, which is what the form opens on,
 * and `service_type` is a room: a dining booking goes straight to the desk
 * for everyone, so showing it would tell the reader nothing about the
 * account. An office's Direct / HOD choice is left unanswered, so the chain
 * shown is the one a request takes when the office does not ask for its HOD -
 * the default the form offers.
 */
export function personaRoute(
  profile: Profile,
  directory: { profiles: Profile[]; units: Unit[]; rules?: ApprovalRules }
): PersonaRoute {
  const { profiles, units, rules } = directory;
  const decides = describeWhatTheyDecide(profile, profiles);
  // The clubs and councils this account is Faculty Advisor of - an
  // appointment in Departments & Clubs, so it follows a change there.
  const advisorFor = clubsBookableBy(profile, profiles, units).map((c) => c.full_name);

  if (profile.role === "club") {
    const advisor = units.find((u) => u.id === profile.unit_id)?.faculty_advisor_id;
    const advisorName = advisor ? nameOf(profiles, advisor) : null;
    return {
      chain: [],
      ifHodApproval: null,
      copiedTo: [],
      advisorFor,
      cannotBook: advisorName
        ? `This account never submits. Its Faculty Advisor, ${advisorName}, books for it.`
        : "This account never submits, and no Faculty Advisor is named for it yet.",
      decides,
    };
  }

  if (bookingTypesFor(profile.role).length === 0) {
    return {
      chain: [],
      ifHodApproval: null,
      copiedTo: [],
      advisorFor,
      cannotBook: "This account does not submit booking requests.",
      decides,
    };
  }

  const request = {
    user_role: profile.role,
    service_type: "room" as const,
    booking_type: defaultBookingTypeFor(profile.role) ?? undefined,
    user_id: profile.id,
  };
  const stages = approvalStageDetailsFor(request, profile, units, { rules, profiles });

  const name = (stage: ApprovalStage) => {
    const deciding = stageApproverIds(stage.approver, profile, { units, profiles })
      .map((id) => profiles.find((p) => p.id === id))
      .filter((p): p is Profile => Boolean(p));
    // A `warden` stage is named after the **rank that is actually deciding**,
    // not after the slot: at a hostel with no Assistant Warden the stage
    // falls to the Warden, and calling that person the Assistant Warden
    // would be the one thing this panel must not do.
    const slot =
      stage.approver.kind === "warden" && deciding.length > 0
        ? [...new Set(deciding.map((p) => ROLE_LABELS[p.role]))].join(" / ")
        : describeApprover(stage.approver, { units, profiles });
    const label = stage.label?.trim() || slot;
    const named = deciding.map((p) => p.full_name);
    return named.length > 0 ? `${label} (${named.join(", ")})` : label;
  };
  const chain = stages.map(name);

  // An office is asked Direct or Requires HOD approval only where the two
  // lead somewhere different; where it is, show both, because which one the
  // requester picks is the whole difference between those two personas.
  const asksChoice = asksOfficeApproval(profile.role, "room", hodApproversFor(profile, units).length > 0, {
    rules,
    directory: { units, profiles },
    requester: profile,
    unitId: profile.unit_id ?? null,
  });
  const ifHodApproval = asksChoice
    ? [
        ...approvalStageDetailsFor({ ...request, office_approval: "hod" }, profile, units, {
          rules,
          profiles,
        }).map(name),
        DESK,
      ]
    : null;

  const copiedTo = hostelWardenCopyIds(profile, profiles)
    .map((id) => {
      const p = profiles.find((x) => x.id === id);
      return p ? `${ROLE_LABELS[p.role]} ${p.full_name}` : null;
    })
    .filter((n): n is string => Boolean(n));

  return { chain: [...chain, DESK], ifHodApproval, copiedTo, advisorFor, cannotBook: null, decides };
}

/** The one line that says what an approver account is *for*. */
function describeWhatTheyDecide(profile: Profile, profiles: Profile[]): string | null {
  if (isHostelWardenRole(profile.role)) {
    const hostel = profile.hostel_name?.trim();
    if (!hostel) return "No hostel is recorded on this account, so it decides nothing.";
    const deciding = hostelWardenCopyIds(profile, profiles).length === 0;
    return deciding
      ? `Decides student requests from ${hostel}.`
      : `Copied on student requests from ${hostel}; the Assistant Warden decides them.`;
  }
  switch (profile.role) {
    case "iar_cell":
      return "Decides the IAR Student Cell's requests, and books for the office.";
    case "gh_manager":
      return "The last stage of every request: approving one is allocating the rooms.";
    case "gh_caretaker":
      return "Reception: check-in, check-out, moving a stay's dates, invoices.";
    case "developer":
      return "The whole console, behind the console password and a second factor.";
    default:
      return null;
  }
}

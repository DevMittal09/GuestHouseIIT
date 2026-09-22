import { formatINR, formatInvoiceDate, type InvoiceDocument } from "@/lib/invoice";
import { formatDateTime, formatDate } from "@/lib/format";
import { describeMealDays, describeMeals } from "@/lib/meals";
import { describeParty } from "@/lib/occupancy";
import { PETS_POLICY_NOTICE } from "@/lib/policy";
import { describeDebit } from "@/lib/debit-heads";
import {
  BOOKING_TYPE_LABELS,
  MEAL_PREFERENCE_LABELS,
  ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  STATUS_LABELS,
  type BookingStatus,
  type BookingWithDetails,
  type Profile,
} from "@/lib/types";
import { portalUrl } from "./config";
import type { Block, EmailDocument } from "./render";

/**
 * What each mail says.
 *
 * Templates return an `EmailDocument` — blocks, not markup — so `render.ts`
 * produces the HTML and the plain-text part from one description. They are
 * pure: no store access, no env beyond `portalUrl`, which makes them trivial
 * to eyeball with `npx tsx`.
 *
 * Copy rules, learned from the rest of this app:
 * - **Never link an ID document.** Those live behind a login; mail says "in
 *   the portal" and links to the page.
 * - **Say the reason verbatim.** A rejection that paraphrases the reviewer is
 *   worse than no mail at all.
 * - **Keep the register formal.** The office found "sleeps 2, 3 with an extra
 *   bed" too informal for the allocation dialog; the same applies here.
 */

/** The facts every mail about a booking repeats, so the reader needs no portal. */
export function bookingFacts(booking: BookingWithDetails): Block {
  const mealsOnly = booking.service_type === "meals_only";
  const rows: [string, string][] = [
    ["Reference", booking.booking_reference_id],
    ["Guest house", booking.guest_house.name],
    ["Booking", SERVICE_TYPE_LABELS[booking.service_type]],
    [mealsOnly ? "First day of meals" : "Check-in", formatDateTime(booking.check_in)],
    [mealsOnly ? "Last day of meals" : "Check-out", formatDateTime(booking.check_out)],
  ];
  // A meals-only booking has no rooms and no guest list; a head count is the
  // whole of what the kitchen was told.
  if (mealsOnly) {
    const n = booking.meal_guest_count ?? 0;
    rows.push(["Guests", `${n} guest${n === 1 ? "" : "s"}`]);
  } else {
    rows.push(["Rooms requested", String(booking.rooms_requested)]);
    rows.push(["Party", describeParty(booking)]);
  }
  rows.push(["Purpose", booking.purpose_of_visit]);
  rows.push(["Booking type", BOOKING_TYPE_LABELS[booking.booking_type]]);
  rows.push(["Debitable head", describeDebit(booking)]);
  if (booking.on_behalf_of_name) {
    // The desk has to know who is actually arriving, not just whose account
    // the booking hangs off.
    rows.push(["Booked on behalf of", booking.on_behalf_of_name]);
  }
  if (booking.has_foreign_national) {
    rows.push(["Foreign nationals", "Yes — passport details are on the booking in the portal"]);
  }
  if (booking.alumni_name) {
    rows.push([
      "For alumnus",
      booking.alumni_roll_number
        ? `${booking.alumni_name} (${booking.alumni_roll_number})`
        : booking.alumni_name,
    ]);
  }
  // Only where the guest house serves them — elsewhere the row is a puzzle.
  if (booking.guest_house.serves_meals) {
    rows.push(["Meals", describeMeals(booking.meals)]);
    if (booking.meal_preference) {
      rows.push(["Meal preference", MEAL_PREFERENCE_LABELS[booking.meal_preference]]);
    }
  }
  // Repeated on every booking mail rather than only the confirmation: it is
  // the one rule a guest can breach before anyone at the desk can stop them.
  rows.push(["Pets", PETS_POLICY_NOTICE]);
  return { kind: "facts", rows };
}

/** Who asked, in the reviewer's terms: name, role, and the scope they sit in. */
function requesterLine(booking: BookingWithDetails): string {
  const r = booking.requester;
  const scope = r.hostel_name ?? r.department_or_club;
  const role = ROLE_LABELS[booking.user_role];
  return scope ? `${r.full_name} — ${role}, ${scope}` : `${r.full_name} — ${role}`;
}

function assignedRoomNumbers(booking: BookingWithDetails): string {
  return booking.assigned_rooms.map((r) => r.room_number).join(", ");
}

const REVIEW_LINK: Record<string, string> = {
  PENDING_WARDEN: "/warden",
  PENDING_FA: "/approvals",
  PENDING_HOD: "/hod",
  PENDING_IAR: "/iar",
  PENDING_GH_MANAGER: "/manager",
};

/** The console a reviewer acts in for a given stage. */
export function queuePathFor(status: BookingStatus): string {
  return REVIEW_LINK[status] ?? "/dashboard";
}

// ------------------------------------------------------------ requester mail

export function submittedToRequester(booking: BookingWithDetails): EmailDocument {
  const pending = STATUS_LABELS[booking.status];
  return {
    heading: "We have your booking request",
    preheader: `${booking.booking_reference_id} — ${pending}. No action needed from you yet.`,
    blocks: [
      {
        kind: "paragraph",
        text: `Your request for ${booking.guest_house.name} has been recorded. Nothing is needed from you at this stage — you will get an email at each step.`,
      },
      bookingFacts(booking),
      {
        kind: "callout",
        tone: "info",
        title: "Current stage",
        lines: [
          pending,
          "Rooms are assigned only at the final stage, by the Guest House Manager.",
        ],
      },
      { kind: "button", label: "View in the portal", href: portalUrl("/dashboard") },
      {
        kind: "note",
        text: "Quote the reference above in any correspondence about this stay.",
      },
    ],
  };
}

export function tierApprovedToRequester(
  booking: BookingWithDetails,
  approverName: string,
  stageApproved: BookingStatus
): EmailDocument {
  // `booking` is read after the transition, so its status is where the
  // request is now: the HOD after a club's advisor, otherwise the manager.
  const withHod = booking.status === "PENDING_HOD";
  const nowWith = withHod ? "the HOD" : "the Guest House Manager";
  return {
    heading: "Your booking has cleared an approval",
    preheader: `${booking.booking_reference_id} approved by ${approverName}; now with ${nowWith}.`,
    blocks: [
      {
        kind: "paragraph",
        text: `${approverName} has approved your request at the ${STATUS_LABELS[stageApproved].replace(/^Pending /, "")} stage. It is now with ${nowWith}${
          withHod ? ", who approves it before it goes to the Guest House Manager" : ", who assigns the actual rooms"
        }.`,
      },
      bookingFacts(booking),
      {
        kind: "callout",
        tone: "info",
        title: "What happens next",
        lines: withHod
          ? [
              "The HOD reviews the request, then it goes to the Guest House Manager for rooms.",
              "You will be emailed at each step.",
            ]
          : [
              "The Guest House Manager reviews the request and allocates rooms.",
              "You will be emailed the room numbers as soon as that is done.",
            ],
      },
      { kind: "button", label: "View in the portal", href: portalUrl("/dashboard") },
    ],
  };
}

export function rejectedToRequester(
  booking: BookingWithDetails,
  reviewerName: string,
  reason: string
): EmailDocument {
  return {
    heading: "Your booking request was not approved",
    preheader: `${booking.booking_reference_id} — rejected by ${reviewerName}.`,
    blocks: [
      {
        kind: "paragraph",
        text: `${reviewerName} has reviewed your request for ${booking.guest_house.name} and has not approved it. The reason given is below, in full.`,
      },
      // Verbatim, under its own heading: the reason is the entire point of
      // this message, and a paraphrase would be a different decision.
      { kind: "callout", tone: "danger", title: "Reason given", lines: [reason] },
      bookingFacts(booking),
      {
        kind: "paragraph",
        text: "If the reason is something you can address, you may submit a fresh request from the portal.",
      },
      { kind: "button", label: "Submit a new request", href: portalUrl("/book") },
    ],
  };
}

export function allocatedToRequester(booking: BookingWithDetails): EmailDocument {
  const rooms = assignedRoomNumbers(booking);
  const blocks: Block[] = [
    {
      kind: "paragraph",
      text: `Your stay at ${booking.guest_house.name} is confirmed and rooms have been allocated.`,
    },
    {
      kind: "callout",
      tone: "success",
      title: "Allocated rooms",
      lines: [
        rooms
          ? `${booking.guest_house.name} — room ${rooms}`
          : `${booking.guest_house.name} — see the portal for room numbers`,
        `Check-in ${formatDateTime(booking.check_in)}, check-out ${formatDateTime(booking.check_out)}.`,
      ],
    },
    bookingFacts(booking),
    {
      kind: "list",
      items: [
        "Every guest must carry the original photo ID whose details were submitted with this booking.",
        "Report to the guest house reception on arrival; the caretaker records the check-in.",
        "Check-out is at the time shown above. Tell the reception if your plans change.",
      ],
    },
  ];

  if (booking.guest_house.serves_meals && booking.meals.length > 0) {
    blocks.push({
      kind: "table",
      caption: "Meals requested",
      head: ["Day", "Meals"],
      rows: describeMealDays(booking.meals).map((line) => {
        const [day, meals] = line.split(": ");
        return [day, meals ?? ""];
      }),
    });
  }

  blocks.push({ kind: "button", label: "View in the portal", href: portalUrl("/dashboard") });

  return {
    heading: "Confirmed — your rooms are allocated",
    preheader: rooms
      ? `${booking.booking_reference_id} — room ${rooms} at ${booking.guest_house.name}.`
      : `${booking.booking_reference_id} — approved at ${booking.guest_house.name}.`,
    blocks,
  };
}

export function reminderToRequester(booking: BookingWithDetails): EmailDocument {
  const rooms = assignedRoomNumbers(booking);
  return {
    heading: "Your stay begins tomorrow",
    preheader: `${booking.booking_reference_id} — check-in ${formatDateTime(booking.check_in)}.`,
    blocks: [
      {
        kind: "paragraph",
        text: `A reminder that your stay at ${booking.guest_house.name} starts tomorrow.`,
      },
      {
        kind: "callout",
        tone: "info",
        title: "Arrival",
        lines: [
          `Check-in ${formatDateTime(booking.check_in)}`,
          rooms ? `Room ${rooms}, ${booking.guest_house.name}` : booking.guest_house.name,
          "IIT Palakkad, Nila campus, Kanjikode, Palakkad 678623",
        ],
      },
      {
        kind: "list",
        items: [
          "Carry the original photo ID for every guest named on the booking.",
          "Report to the guest house reception on arrival.",
          `Quote reference ${booking.booking_reference_id} at the desk.`,
        ],
      },
      { kind: "button", label: "View in the portal", href: portalUrl("/dashboard") },
    ],
  };
}

export function cancelledToRequester(
  booking: BookingWithDetails,
  reason: string | null
): EmailDocument {
  return {
    heading: "Your booking has been cancelled",
    preheader: `${booking.booking_reference_id} — cancelled. Any rooms held have been released.`,
    blocks: [
      {
        kind: "paragraph",
        text: `The booking below has been cancelled and any rooms held for it have been released.`,
      },
      ...(reason
        ? [{ kind: "callout" as const, tone: "warning" as const, title: "Reason recorded", lines: [reason] }]
        : []),
      bookingFacts(booking),
      { kind: "button", label: "Submit a new request", href: portalUrl("/book") },
    ],
  };
}

export function cancellationDecidedToRequester(
  booking: BookingWithDetails,
  outcome: "approved" | "rejected",
  managerName: string,
  reason: string | null
): EmailDocument {
  if (outcome === "approved") {
    return {
      heading: "Your cancellation has been approved",
      preheader: `${booking.booking_reference_id} — cancellation approved; rooms released.`,
      blocks: [
        {
          kind: "paragraph",
          text: `${managerName} has approved your cancellation request. The rooms held for this booking have been released.`,
        },
        bookingFacts(booking),
        { kind: "button", label: "Submit a new request", href: portalUrl("/book") },
      ],
    };
  }
  return {
    heading: "Your cancellation request was declined",
    preheader: `${booking.booking_reference_id} — cancellation declined; the booking stands.`,
    blocks: [
      {
        kind: "paragraph",
        text: `${managerName} has declined your cancellation request, so this booking still stands and the rooms remain held for you.`,
      },
      ...(reason
        ? [{ kind: "callout" as const, tone: "warning" as const, title: "Reason given", lines: [reason] }]
        : []),
      bookingFacts(booking),
      {
        kind: "paragraph",
        text: "If you cannot use the stay, contact the Guest House Manager by replying to this email.",
      },
    ],
  };
}

// ------------------------------------------------------------ reviewer mail

export function awaitingReview(
  booking: BookingWithDetails,
  reviewer: Profile,
  { forwardedBy }: { forwardedBy?: string } = {}
): EmailDocument {
  const stage = STATUS_LABELS[booking.status];
  return {
    heading: forwardedBy ? "A booking has been forwarded to you" : "A booking is awaiting your review",
    preheader: `${booking.booking_reference_id} from ${booking.requester.full_name} — ${stage}.`,
    blocks: [
      {
        kind: "paragraph",
        text: forwardedBy
          ? `${forwardedBy} has approved the request below and forwarded it to you.`
          : `A new booking request needs your decision.`,
      },
      { kind: "facts", rows: [["Requested by", requesterLine(booking)]] },
      bookingFacts(booking),
      {
        kind: "button",
        label: "Open the review queue",
        href: portalUrl(queuePathFor(booking.status)),
      },
      {
        kind: "note",
        text: "Guest ID documents are attached to the request in the portal — they are never sent by email.",
      },
      {
        kind: "note",
        text: `You are receiving this because you are the ${ROLE_LABELS[reviewer.role]} for this request.`,
      },
    ],
  };
}

export function allocatedToDesk(booking: BookingWithDetails, allocatedBy: string): EmailDocument {
  const rooms = assignedRoomNumbers(booking);
  return {
    heading: "Allocation recorded",
    preheader: `${booking.booking_reference_id} — room ${rooms || "(none)"} at ${booking.guest_house.name}.`,
    blocks: [
      {
        kind: "paragraph",
        text: `${allocatedBy} has allocated rooms for the booking below. This is your copy for the desk; the requester has been told the room numbers.`,
      },
      {
        kind: "facts",
        rows: [
          ["Allocated rooms", rooms || "(none recorded)"],
          ["Requested by", requesterLine(booking)],
          ["Contact", booking.requester.email],
        ],
      },
      bookingFacts(booking),
      { kind: "button", label: "Open the console", href: portalUrl("/manager") },
    ],
  };
}

export function cancellationRequestedToManager(
  booking: BookingWithDetails,
  reason: string
): EmailDocument {
  const rooms = assignedRoomNumbers(booking);
  return {
    heading: "A cancellation needs your decision",
    preheader: `${booking.booking_reference_id} — ${booking.requester.full_name} asks to cancel.`,
    blocks: [
      {
        kind: "paragraph",
        text: `${booking.requester.full_name} has asked to cancel a booking that is already approved. The rooms stay held until you decide.`,
      },
      { kind: "callout", tone: "warning", title: "Reason given", lines: [reason] },
      {
        kind: "facts",
        rows: [
          ["Rooms currently held", rooms || "(none)"],
          ["Requested by", requesterLine(booking)],
          ["Contact", booking.requester.email],
        ],
      },
      bookingFacts(booking),
      { kind: "button", label: "Review the cancellation", href: portalUrl("/manager") },
    ],
  };
}

/**
 * The same cancellation, told to whoever reviewed the request — for
 * information only.
 *
 * They signed the booking off, so they should know it is being withdrawn;
 * but the decision is the Guest House Manager's alone, and a mail that looks
 * like a request for approval would have three people waiting on each other.
 * Hence no button and an explicit "no action needed".
 */
export function cancellationRequestedToReviewer(
  booking: BookingWithDetails,
  reason: string
): EmailDocument {
  return {
    heading: "A booking you reviewed is being cancelled",
    preheader: `${booking.booking_reference_id} — ${booking.requester.full_name} asks to cancel. No action needed.`,
    blocks: [
      {
        kind: "paragraph",
        text: `${booking.requester.full_name} has asked to cancel a request you reviewed. This is for your information — the Guest House Manager decides, and there is nothing for you to do.`,
      },
      { kind: "callout", tone: "info", title: "Reason given", lines: [reason] },
      bookingFacts(booking),
    ],
  };
}

export function cancellationToDesk(booking: BookingWithDetails, actorName: string): EmailDocument {
  return {
    heading: "A booking was cancelled",
    preheader: `${booking.booking_reference_id} — cancelled; rooms released.`,
    blocks: [
      {
        kind: "paragraph",
        text: `${actorName} cancelled the booking below. Any rooms it held are free again from now.`,
      },
      {
        kind: "facts",
        rows: [
          ["Requested by", requesterLine(booking)],
          ["Status", STATUS_LABELS[booking.status]],
        ],
      },
      bookingFacts(booking),
      { kind: "button", label: "Open the console", href: portalUrl("/manager") },
    ],
  };
}

// ------------------------------------------------------------ digests

/**
 * One mail a day per reviewer with a non-empty queue, instead of one per
 * booking.
 *
 * This matters more than it looks: per-item mail to a warden during fest week
 * trains them to filter the portal into spam, and then the portal stops
 * working. One 8am summary does not.
 */
export function reviewerDigest(
  reviewer: Profile,
  bookings: BookingWithDetails[],
  today: string
): EmailDocument {
  const rows = bookings.map((b) => [
    b.booking_reference_id,
    b.requester.full_name,
    b.guest_house.name,
    formatDate(b.check_in),
    String(b.rooms_requested),
    waitingFor(b),
  ]);
  const queuePath = bookings.length > 0 ? queuePathFor(bookings[0].status) : "/dashboard";
  return {
    heading: `${bookings.length} request${bookings.length === 1 ? "" : "s"} awaiting your review`,
    preheader: `Guest house approvals pending as of ${formatDate(today)}.`,
    blocks: [
      {
        kind: "paragraph",
        text: `Good morning. These guest house requests are waiting on your decision as of ${formatDate(today)}.`,
      },
      {
        kind: "table",
        head: ["Reference", "Requested by", "Guest house", "Check-in", "Rooms", "Waiting"],
        rows,
      },
      { kind: "button", label: "Open the review queue", href: portalUrl(queuePath) },
      {
        kind: "note",
        text: `Sent once a day to the ${ROLE_LABELS[reviewer.role]}, not per request.`,
      },
    ],
  };
}

/** "3 days" — how long a booking has sat in its current queue. */
export function waitingFor(booking: BookingWithDetails, now: Date = new Date()): string {
  const since = booking.updated_at ?? booking.created_at;
  const hours = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 3_600_000));
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function escalationToReviewer(
  reviewer: Profile,
  bookings: BookingWithDetails[],
  thresholdHours: number
): EmailDocument {
  return {
    heading: `${bookings.length} request${bookings.length === 1 ? " has" : "s have"} been waiting over ${thresholdHours} hours`,
    preheader: `Guest house approvals overdue for the ${ROLE_LABELS[reviewer.role]}.`,
    blocks: [
      {
        kind: "paragraph",
        text: `The requests below have been in your queue for more than ${thresholdHours} hours. Guests cannot be given rooms until they are decided, so a rejection is more useful than silence.`,
      },
      {
        kind: "table",
        head: ["Reference", "Requested by", "Check-in", "Waiting"],
        rows: bookings.map((b) => [
          b.booking_reference_id,
          b.requester.full_name,
          formatDate(b.check_in),
          waitingFor(b),
        ]),
      },
      {
        kind: "button",
        label: "Open the review queue",
        href: portalUrl(bookings.length > 0 ? queuePathFor(bookings[0].status) : "/dashboard"),
      },
      { kind: "note", text: "The Guest House Manager is copied on this reminder." },
    ],
  };
}

/**
 * The day-wise guest house log the Administration Section asked for
 * (requirement 3): arrivals, departures, who is in the building, and what is
 * still holding a room past its check-out.
 *
 * Rendered as HTML tables rather than a PDF because `lib/report-pdf.ts` is
 * client-side (jsPDF, dynamically imported) and there is no browser here.
 */
export interface DailyReportSections {
  arrivals: BookingWithDetails[];
  departures: BookingWithDetails[];
  inHouse: BookingWithDetails[];
  overdue: BookingWithDetails[];
  awaitingAllocation: BookingWithDetails[];
}

export function dailyDeskReport(
  day: string,
  guestHouseName: string,
  sections: DailyReportSections,
  occupancy: { rooms: number; held: number }
): EmailDocument {
  const stayRow = (b: BookingWithDetails) => [
    b.booking_reference_id,
    b.requester.full_name,
    b.assigned_rooms.map((r) => r.room_number).join(", ") || "—",
    describeParty(b),
    formatDateTime(b.check_in),
    formatDateTime(b.check_out),
  ];
  const head = ["Reference", "Guest", "Rooms", "Party", "Check-in", "Check-out"];
  const free = Math.max(0, occupancy.rooms - occupancy.held);
  const quiet =
    sections.arrivals.length === 0 &&
    sections.departures.length === 0 &&
    sections.inHouse.length === 0 &&
    sections.overdue.length === 0 &&
    sections.awaitingAllocation.length === 0;

  return {
    heading: `${guestHouseName} — daily log for ${formatDate(day)}`,
    preheader: `${sections.arrivals.length} arriving, ${sections.departures.length} leaving, ${sections.inHouse.length} in house, ${free} of ${occupancy.rooms} rooms free.`,
    blocks: [
      // Said plainly, so a quiet day is not five empty tables the reader has
      // to scan before concluding nothing is happening.
      ...(quiet
        ? [
            {
              kind: "paragraph" as const,
              text: `No arrivals, departures or guests in house at ${guestHouseName} today, and nothing awaiting allocation. This report is sent daily either way, so a day without one means the job did not run.`,
            },
          ]
        : []),
      {
        kind: "facts",
        rows: [
          ["Date", formatDate(day)],
          ["Guest house", guestHouseName],
          ["Rooms free now", `${free} of ${occupancy.rooms}`],
          ["Arrivals today", String(sections.arrivals.length)],
          ["Departures today", String(sections.departures.length)],
          ["Currently in house", String(sections.inHouse.length)],
        ],
      },
      { kind: "table", caption: "Arriving today", head, rows: sections.arrivals.map(stayRow) },
      { kind: "table", caption: "Departing today", head, rows: sections.departures.map(stayRow) },
      { kind: "table", caption: "Currently in house", head, rows: sections.inHouse.map(stayRow) },
      ...(sections.overdue.length > 0
        ? [
            {
              kind: "callout" as const,
              tone: "warning" as const,
              title: "Past check-out, not yet vacated",
              lines: [
                "These stays are still holding their rooms. Mark them Vacated at the desk to free the rooms.",
              ],
            },
            { kind: "table" as const, head, rows: sections.overdue.map(stayRow) },
          ]
        : []),
      ...(sections.awaitingAllocation.length > 0
        ? [
            {
              kind: "table" as const,
              caption: "Awaiting your allocation",
              head: ["Reference", "Requested by", "Check-in", "Rooms", "Waiting"],
              rows: sections.awaitingAllocation.map((b) => [
                b.booking_reference_id,
                b.requester.full_name,
                formatDate(b.check_in),
                String(b.rooms_requested),
                waitingFor(b),
              ]),
            },
          ]
        : []),
      { kind: "button", label: "Open the console", href: portalUrl("/manager") },
      { kind: "note", text: "Sent once a day. Room availability by hour is at /availability in the portal." },
    ],
  };
}

/** An issued official invoice, to Accounts (Phase 5). The PDF is attached. */
export function invoiceToAccounts(booking: BookingWithDetails, invoice: InvoiceDocument): EmailDocument {
  return {
    heading: `Invoice ${invoice.invoice_number}`,
    preheader: `${invoice.guest_house} Guest House — ${formatINR(invoice.grand_total)}, debitable to ${invoice.debit_head_label}.`,
    blocks: [
      {
        kind: "paragraph",
        text: `The Guest House has issued the invoice below for an official stay. The invoice is attached as a PDF; it is the record — this message only summarises it.`,
      },
      {
        kind: "facts",
        rows: [
          ["Invoice No.", invoice.invoice_number ?? ""],
          ["Invoice date", formatInvoiceDate(invoice.invoice_date)],
          ["Booked by", `${invoice.booked_by} — ${invoice.unit}`],
          ["Debitable head", invoice.debit_head_label],
          ...(invoice.project_number
            ? ([["Project", `${invoice.project_number} — ${invoice.project_title ?? ""}`]] as [string, string][])
            : []),
          ["Primary guest", invoice.primary_guest],
          ["Rooms (A)", formatINR(invoice.subtotal_rooms)],
          ["Dining (B)", formatINR(invoice.subtotal_dining)],
          ["GST", formatINR(invoice.gst)],
          ["Grand total", formatINR(invoice.grand_total)],
        ],
      },
      bookingFacts(booking),
    ],
  };
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countsAgainstMealCapacity } from "@/lib/meals";
import type { DataStore } from "@/lib/store/types";
import {
  hasLapsed,
  missedSweepable,
  reinstateMissedError,
  reinstatedAfterMissed,
  statusBeforeMissed,
} from "@/lib/workflow";
import { STATUS_LABELS, type BookingLog, type BookingStatus, type NewBookingInput } from "@/lib/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * The office's eighth list (7 Oct 2026), phase 4: a request nobody decided
 * before its check-in is marked **Missed** by the nightly job, the requester
 * is told, and the manager can put it back (migration 29).
 */

const log = (
  patch: Partial<BookingLog> & Pick<BookingLog, "new_status" | "timestamp">
): BookingLog => ({
  id: `l-${patch.new_status}-${patch.timestamp}`,
  booking_id: "b-1",
  previous_status: null,
  action_by: null,
  action_by_name: "System",
  remarks: null,
  ...patch,
});

// ------------------------------------------------------------- the rule

describe("which requests the nightly job marks", () => {
  const past = "2026-10-01T06:30:00.000Z";
  const future = "2026-12-01T06:30:00.000Z";
  const now = new Date("2026-10-07T02:30:00.000Z");

  const stay = (status: BookingStatus, checkIn: string) => ({
    status,
    check_in: checkIn,
    check_out: future,
    service_type: "room" as const,
    logs: [] as BookingLog[],
  });

  it("marks a pending request whose check-in has gone", () => {
    for (const status of ["PENDING_WARDEN", "PENDING_HOD", "PENDING_IAR", "PENDING_GH_MANAGER"] as const) {
      expect(missedSweepable(stay(status, past), now)).toBe(true);
    }
  });

  it("leaves a request whose check-in is still to come", () => {
    expect(missedSweepable(stay("PENDING_WARDEN", future), now)).toBe(false);
  });

  it("leaves anything already decided", () => {
    for (const status of ["APPROVED", "REJECTED", "CANCELLED", "OCCUPIED", "VACATED", "MISSED"] as const) {
      expect(missedSweepable(stay(status, past), now)).toBe(false);
    }
  });

  /**
   * A dining booking's `check_in` is midnight on its first day of meals, so
   * it is in the past the moment somebody books lunch for today - and booking
   * lunch for today is allowed. What makes one lapse is its last meal day
   * being over.
   */
  it("measures a meal booking from its last day of meals", () => {
    const dining = (from: string, to: string) => ({
      status: "PENDING_GH_MANAGER" as const,
      check_in: from,
      check_out: to,
      service_type: "meals_only" as const,
      logs: [] as BookingLog[],
    });
    // Meals today: the first day is "past" but the last is not.
    expect(missedSweepable(dining("2026-10-07T00:00:00.000Z", "2026-10-07T18:29:00.000Z"), now)).toBe(
      false
    );
    // Meals that finished last week.
    expect(missedSweepable(dining("2026-10-01T00:00:00.000Z", "2026-10-02T18:29:00.000Z"), now)).toBe(
      true
    );
    // And the older description agrees with the sweep.
    expect(hasLapsed(dining("2026-10-01T00:00:00.000Z", "2026-10-02T18:29:00.000Z"), now)).toBe(true);
  });

  /**
   * The one that makes reinstating mean anything. Without it the next night's
   * run would mark a request the manager had deliberately recovered, and go
   * on doing it every night.
   */
  it("never marks a request the manager has put back", () => {
    const reinstated = {
      ...stay("PENDING_GH_MANAGER", past),
      logs: [
        log({ new_status: "MISSED", previous_status: "PENDING_GH_MANAGER", timestamp: "2026-10-05T02:30:00.000Z" }),
        log({ new_status: "PENDING_GH_MANAGER", previous_status: "MISSED", timestamp: "2026-10-06T09:00:00.000Z" }),
      ],
    };
    expect(missedSweepable(reinstated, now)).toBe(false);
    // Marked again after the reinstatement (by the console's repair tool, say)
    // and the sweep may act once more.
    expect(
      missedSweepable(
        {
          ...reinstated,
          logs: [
            ...reinstated.logs,
            log({ new_status: "MISSED", previous_status: "PENDING_GH_MANAGER", timestamp: "2026-10-06T10:00:00.000Z" }),
            log({ new_status: "PENDING_GH_MANAGER", previous_status: "MISSED", timestamp: "2026-10-06T11:00:00.000Z" }),
            log({ new_status: "MISSED", previous_status: "PENDING_GH_MANAGER", timestamp: "2026-10-06T12:00:00.000Z" }),
            log({ new_status: "PENDING_WARDEN", previous_status: "MISSED", timestamp: "2026-10-06T13:00:00.000Z" }),
          ],
        },
        now
      )
    ).toBe(false);
  });

  it("reads a reinstatement off the log, not out of the remarks", () => {
    expect(reinstatedAfterMissed([])).toBe(false);
    expect(reinstatedAfterMissed([log({ new_status: "MISSED", timestamp: "2026-10-05T00:00:00.000Z" })])).toBe(
      false
    );
    expect(
      reinstatedAfterMissed([
        log({ new_status: "MISSED", timestamp: "2026-10-05T00:00:00.000Z" }),
        log({ new_status: "PENDING_WARDEN", previous_status: "MISSED", timestamp: "2026-10-04T00:00:00.000Z" }),
      ])
      // The reinstatement is older than the marking, so it is not this one's.
    ).toBe(false);
  });
});

// --------------------------------------------------------- putting it back

describe("reinstating a missed request", () => {
  it("sends it back to the stage it was waiting at", () => {
    expect(
      statusBeforeMissed([
        log({ new_status: "PENDING_WARDEN", timestamp: "2026-10-01T00:00:00.000Z" }),
        log({ new_status: "MISSED", previous_status: "PENDING_WARDEN", timestamp: "2026-10-05T00:00:00.000Z" }),
      ])
    ).toBe("PENDING_WARDEN");
    // The newest marking wins.
    expect(
      statusBeforeMissed([
        log({ new_status: "MISSED", previous_status: "PENDING_WARDEN", timestamp: "2026-10-02T00:00:00.000Z" }),
        log({ new_status: "MISSED", previous_status: "PENDING_HOD", timestamp: "2026-10-05T00:00:00.000Z" }),
      ])
    ).toBe("PENDING_HOD");
  });

  it("falls back to the manager when the log does not say", () => {
    expect(statusBeforeMissed([])).toBe("PENDING_GH_MANAGER");
    // Forced into MISSED from an already-decided status by the repair tool:
    // there is no pending stage to go back to.
    expect(
      statusBeforeMissed([
        log({ new_status: "MISSED", previous_status: "APPROVED", timestamp: "2026-10-05T00:00:00.000Z" }),
      ])
    ).toBe("PENDING_GH_MANAGER");
  });

  it("is offered for a missed request and nothing else", () => {
    expect(reinstateMissedError({ status: "MISSED" })).toBeNull();
    for (const status of ["REJECTED", "CANCELLED", "APPROVED", "PENDING_WARDEN"] as const) {
      expect(reinstateMissedError({ status })).toMatch(/Only a request marked Missed/);
    }
  });
});

// ------------------------------------------------------- it frees the kitchen

describe("a missed meal booking", () => {
  it("stops holding its places at the sitting", () => {
    expect(countsAgainstMealCapacity("PENDING_GH_MANAGER")).toBe(true);
    expect(countsAgainstMealCapacity("MISSED")).toBe(false);
  });
});

// ------------------------------------------------------------- the sweep

describe("the nightly sweep", () => {
  let store: DataStore;
  let db: ReturnType<typeof useThrowawayMockDb>;

  beforeAll(async () => {
    // Mail goes nowhere, and is not redirected to one mailbox - this test
    // reads the outbox to check the requester was told.
    process.env.MAIL_DRY_RUN = "true";
    delete process.env.MAIL_REDIRECT_ALL_TO;
    db = useThrowawayMockDb();
    store = new (await import("@/lib/store/mock")).MockStore();
    await store.listProfiles(); // writes the seeded file
  });
  afterAll(() => db.cleanup());

  const student = "student-anjali";
  const guestHouse = "gh-bageshri";

  const request = (patch: Partial<NewBookingInput> = {}): NewBookingInput => ({
    user_id: student,
    guest_house_id: guestHouse,
    user_role: "student",
    status: "PENDING_WARDEN",
    purpose_of_visit: "Parents visiting",
    check_in: "2026-10-01T06:30:00.000Z",
    check_out: "2026-10-03T04:30:00.000Z",
    booking_type: "personal",
    service_type: "room",
    debit_head: "personal_funds",
    debit_details: null,
    debit_document_url: null,
    meal_preference: null,
    meal_diet_counts: null,
    meal_guest_count: null,
    pets_policy_acknowledged: true,
    alumni_name: null,
    alumni_roll_number: null,
    alumni_id_url: null,
    custom_fields: null,
    rooms: [{ room_type: null, guests: [{ name: "Mother", age: 50, gender: "female", relationship: "Mother", id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null }] }],
    meals: [],
    ...patch,
  });

  it("marks what has lapsed, logs it, mails the requester, and leaves the rest", async () => {
    const { runMissedSweep } = await import("@/lib/missed-server");
    const { dispatchOutbox } = await import("@/lib/mail/dispatch");

    const lapsed = await store.createBooking(request());
    const future = await store.createBooking(
      request({ check_in: "2026-12-01T06:30:00.000Z", check_out: "2026-12-03T04:30:00.000Z" })
    );
    const decided = await store.createBooking(request({ status: "REJECTED" }));

    const now = new Date("2026-10-07T02:30:00.000Z");
    expect(await runMissedSweep(now)).toBe(1);

    const marked = await store.getBooking(lapsed.id);
    expect(marked?.status).toBe("MISSED");
    expect(STATUS_LABELS.MISSED).toBe("Missed");
    // The log says what happened and that nobody decided it.
    const entry = marked!.logs.find((l) => l.new_status === "MISSED");
    expect(entry?.previous_status).toBe("PENDING_WARDEN");
    expect(entry?.action_by).toBeNull();
    expect(entry?.action_by_name).toMatch(/System/);
    expect(entry?.remarks).toMatch(/check-in passed before anyone decided/);

    expect((await store.getBooking(future.id))?.status).toBe("PENDING_WARDEN");
    expect((await store.getBooking(decided.id))?.status).toBe("REJECTED");

    // The requester was told, once.
    await dispatchOutbox({ batchSize: 50 });
    const mails = (await store.listEmails({ bookingId: lapsed.id, limit: 20 })).filter(
      (m) => m.event_key === "booking.missed.requester"
    );
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/missed/i);

    /**
     * **Running it twice changes nothing** - the office's own test. The
     * marked request is no longer in an active status, so the second pass
     * does not see it, and no second mail is queued.
     */
    expect(await runMissedSweep(now)).toBe(0);
    expect(
      (await store.listEmails({ bookingId: lapsed.id, limit: 20 })).filter(
        (m) => m.event_key === "booking.missed.requester"
      )
    ).toHaveLength(1);
  });

  it("puts a missed request back where it was waiting, and does not mark it again", async () => {
    const { runMissedSweep } = await import("@/lib/missed-server");
    const booking = await store.createBooking(request({ status: "PENDING_GH_MANAGER" }));
    const now = new Date("2026-10-07T02:30:00.000Z");
    expect(await runMissedSweep(now)).toBe(1);
    expect((await store.getBooking(booking.id))?.status).toBe("MISSED");

    // What the manager's action does, through the store it uses.
    const missed = await store.getBooking(booking.id);
    const back = statusBeforeMissed(missed!.logs);
    expect(back).toBe("PENDING_GH_MANAGER");
    await store.updateBookingStatus(
      booking.id,
      { status: back },
      {
        action_by: "gh-manager",
        action_by_name: "Guest House Manager",
        new_status: back,
        remarks: "Reinstated: the guest is coming next week instead",
      }
    );
    const again = await store.getBooking(booking.id);
    expect(again?.status).toBe("PENDING_GH_MANAGER");
    // Its check-in is still in the past, so only the reinstatement stops the
    // sweep marking it a second time.
    expect(missedSweepable(again!, now)).toBe(false);
    expect(await runMissedSweep(now)).toBe(0);
    expect((await store.getBooking(booking.id))?.status).toBe("PENDING_GH_MANAGER");
  });

  it("measures a dining booking from its last day of meals", async () => {
    const { runMissedSweep } = await import("@/lib/missed-server");
    const soon = await store.createBooking(
      request({
        status: "PENDING_GH_MANAGER",
        service_type: "meals_only",
        rooms: [],
        meal_guest_count: 4,
        check_in: "2026-10-07T00:00:00.000Z",
        check_out: "2026-10-07T18:29:00.000Z",
        meals: [{ date: "2026-10-07", breakfast: false, lunch: true, dinner: false }],
      })
    );
    const over = await store.createBooking(
      request({
        status: "PENDING_GH_MANAGER",
        service_type: "meals_only",
        rooms: [],
        meal_guest_count: 4,
        check_in: "2026-10-01T00:00:00.000Z",
        check_out: "2026-10-01T18:29:00.000Z",
        meals: [{ date: "2026-10-01", breakfast: false, lunch: true, dinner: false }],
      })
    );
    const now = new Date("2026-10-07T02:30:00.000Z");
    expect(await runMissedSweep(now)).toBe(1);
    expect((await store.getBooking(over.id))?.status).toBe("MISSED");
    expect((await store.getBooking(soon.id))?.status).toBe("PENDING_GH_MANAGER");
    const marked = await store.getBooking(over.id);
    expect(marked!.logs.find((l) => l.new_status === "MISSED")?.remarks).toMatch(/last day of meals/);
  });
});

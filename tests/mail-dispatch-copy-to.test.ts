import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataStore } from "@/lib/store/types";
import type { NewEmailInput } from "@/lib/mail/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * "The copy to email feature at the bottom of new booking isnt working"
 * (11 Nov 2026). Two causes, both at send time, both under
 * `MAIL_ALLOWED_RECIPIENTS`:
 *
 * 1. A Copy-to address not on the list is dropped - by design - but the row
 *    still read SENT with that address listed under cc, so it looked
 *    delivered. The row now carries a note naming who was dropped.
 * 2. When every **To** address was dropped (most demo accounts' addresses
 *    are fake) the whole message was skipped, taking an allowed Copy-to
 *    address with it. A surviving Cc is now sent.
 */

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  process.env.MAIL_DRY_RUN = "true";
  delete process.env.MAIL_REDIRECT_ALL_TO;
  process.env.MAIL_ALLOWED_RECIPIENTS = "real@gmail.com, copy@gmail.com";
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  await store.listProfiles();
});
afterAll(() => {
  delete process.env.MAIL_ALLOWED_RECIPIENTS;
  db.cleanup();
});

let n = 0;
function row(to: string[], cc: string[]): NewEmailInput {
  n += 1;
  return {
    booking_id: null,
    event_key: "booking.submitted.requester",
    idempotency_key: `copy-to-test-${n}`,
    to_emails: to,
    cc_emails: cc,
    subject: "Guest house booking",
    body_html: "<html><body><p>hello</p></body></html>",
    body_text: "hello",
    thread_root: null,
    is_thread_root: false,
  };
}

async function dispatchOne(input: NewEmailInput) {
  await store.enqueueEmails([input]);
  const { dispatchOutbox } = await import("@/lib/mail/dispatch");
  await dispatchOutbox({ batchSize: 50 });
  const rows = await store.listEmails({ limit: 100 });
  return rows.find((r) => r.idempotency_key === input.idempotency_key)!;
}

describe("Copy to under MAIL_ALLOWED_RECIPIENTS", () => {
  it("sends to an allowed Copy-to address when the requester's own address is dropped", async () => {
    const sent = await dispatchOne(row(["fake.student@smail.iitpkd.ac.in"], ["copy@gmail.com"]));
    expect(sent.status).toBe("SENT");
    expect(sent.last_error).toBe(
      "Not delivered to fake.student@smail.iitpkd.ac.in (not in MAIL_ALLOWED_RECIPIENTS)"
    );
  });

  it("names a dropped Copy-to address on a row that was otherwise sent", async () => {
    const sent = await dispatchOne(row(["real@gmail.com"], ["typed.by.hand@gmail.com"]));
    expect(sent.status).toBe("SENT");
    expect(sent.last_error).toContain("typed.by.hand@gmail.com");
  });

  it("leaves a fully delivered row with no note", async () => {
    const sent = await dispatchOne(row(["real@gmail.com"], ["copy@gmail.com"]));
    expect(sent.status).toBe("SENT");
    expect(sent.last_error).toBeNull();
  });

  it("still settles, not fails, a message with nobody allowed in To or Cc", async () => {
    const sent = await dispatchOne(row(["fake@iitpkd.ac.in"], ["also.fake@iitpkd.ac.in"]));
    expect(sent.status).toBe("SENT");
    expect(sent.last_error).toMatch(/^Not sent: no recipient is in MAIL_ALLOWED_RECIPIENTS/);
  });
});

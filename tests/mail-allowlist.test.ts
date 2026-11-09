import { describe, expect, it } from "vitest";
import {
  applyAllowList,
  isDeliverable,
  parseAllowedRecipients,
} from "@/lib/mail/deliverable";
import { applyRedirect } from "@/lib/mail/redirect";
import type { OutboundMessage } from "@/lib/mail/types";

/**
 * `MAIL_ALLOWED_RECIPIENTS` (9 Nov 2026). The owner, testing real Gmail
 * delivery for the first time: *"For invalid mail ids, that is mail ids which
 * do not exist, just dont send the mails, Like i dont want errors due to that
 * invalid mail ids."*
 *
 * The distinction the whole thing rests on: an address not on the list is
 * **dropped**, which is not a failure. Nothing is attempted and nothing is
 * retried.
 */

const message = (to: string[], cc: string[] = []): OutboundMessage => ({
  to,
  cc,
  subject: "Guest house booking",
  html: "<html><body><p>hello</p></body></html>",
  text: "hello",
});

describe("parsing the variable", () => {
  it("treats unset as no restriction and an empty list as nobody", () => {
    // These mean opposite things, and the difference is the safety property:
    // only an absent variable opens the gate.
    expect(parseAllowedRecipients(null)).toBeNull();
    expect(parseAllowedRecipients(undefined)).toBeNull();
    expect(parseAllowedRecipients("")).toEqual([]);
    expect(parseAllowedRecipients("  ")).toEqual([]);
  });

  it("splits on commas, semicolons and whitespace, and lowercases", () => {
    expect(parseAllowedRecipients("A@x.in, b@Y.IN; c@z.in\n@iitpkd.ac.in")).toEqual([
      "a@x.in",
      "b@y.in",
      "c@z.in",
      "@iitpkd.ac.in",
    ]);
  });
});

describe("whether one address is deliverable", () => {
  it("allows everything when there is no list", () => {
    expect(isDeliverable("anyone@anywhere.in", null)).toBe(true);
  });

  it("allows nothing when the list is empty", () => {
    expect(isDeliverable("anyone@anywhere.in", [])).toBe(false);
  });

  it("matches a whole address, ignoring case and surrounding space", () => {
    const rules = parseAllowedRecipients("real@gmail.com");
    expect(isDeliverable("Real@Gmail.COM", rules)).toBe(true);
    expect(isDeliverable("  real@gmail.com  ", rules)).toBe(true);
    expect(isDeliverable("other@gmail.com", rules)).toBe(false);
  });

  it("matches a whole domain with an @domain entry", () => {
    const rules = parseAllowedRecipients("@iitpkd.ac.in");
    expect(isDeliverable("anyone@iitpkd.ac.in", rules)).toBe(true);
    // A subdomain is a different domain: @iitpkd.ac.in must not sweep in
    // @smail.iitpkd.ac.in, which is where the students are.
    expect(isDeliverable("student@smail.iitpkd.ac.in", rules)).toBe(false);
  });

  it("refuses a blank address rather than treating it as a domain match", () => {
    expect(isDeliverable("", parseAllowedRecipients("@x.in"))).toBe(false);
    expect(isDeliverable("   ", parseAllowedRecipients("@x.in"))).toBe(false);
  });
});

describe("filtering a message", () => {
  const rules = parseAllowedRecipients(
    "student.iitpkd01@gmail.com, muhamed.rizwan2222@gmail.com"
  );

  it("leaves a message untouched when there is no list", () => {
    const original = message(["a@x.in"], ["b@x.in"]);
    const { message: out, dropped } = applyAllowList(original, null);
    expect(out).toBe(original);
    expect(dropped).toEqual([]);
  });

  it("removes undeliverable addresses from To and Cc and names them", () => {
    const { message: out, dropped } = applyAllowList(
      message(
        ["student.iitpkd01@gmail.com"],
        ["muhamed.rizwan2222@gmail.com", "dwarden.saveriboys@iitpkd.ac.in"]
      ),
      rules
    );
    expect(out.to).toEqual(["student.iitpkd01@gmail.com"]);
    expect(out.cc).toEqual(["muhamed.rizwan2222@gmail.com"]);
    expect(dropped).toEqual(["dwarden.saveriboys@iitpkd.ac.in"]);
  });

  it("leaves the body alone - this is the same message to fewer people", () => {
    const original = message(["student.iitpkd01@gmail.com"], ["fake@iitpkd.ac.in"]);
    const { message: out } = applyAllowList(original, rules);
    expect(out.subject).toBe(original.subject);
    expect(out.html).toBe(original.html);
    expect(out.text).toBe(original.text);
  });

  it("empties To when every recipient is undeliverable", () => {
    // What `dispatch.ts` reads to settle the row with a note instead of
    // failing it: an empty To *and* something dropped.
    const { message: out, dropped } = applyAllowList(
      message(["nobody@iitpkd.ac.in"], ["also.nobody@iitpkd.ac.in"]),
      rules
    );
    expect(out.to).toEqual([]);
    expect(out.cc).toEqual([]);
    expect(dropped).toEqual(["nobody@iitpkd.ac.in", "also.nobody@iitpkd.ac.in"]);
  });

  it("distinguishes a message with no recipients at all from one that was filtered", () => {
    // A booking whose requester has no address on file is a real fault and
    // must still FAIL; an address the deployment says is fake must not. The
    // dispatcher tells them apart by `dropped` being empty.
    const { dropped } = applyAllowList(message([], []), rules);
    expect(dropped).toEqual([]);
  });
});

describe("the allow list and the redirect together", () => {
  it("filters the real recipients first, then rewrites the envelope", () => {
    // Order matters: the other way round would test the redirect mailbox
    // against the allow list, which answers nothing. With both set you see,
    // in one mailbox, only the mail that would really have been delivered.
    const rules = parseAllowedRecipients("real@gmail.com");
    const addressed = applyAllowList(
      message(["real@gmail.com"], ["fake@iitpkd.ac.in"]),
      rules
    );
    const { message: out } = applyRedirect(addressed.message, "watcher@gmail.com");
    expect(out.to).toEqual(["watcher@gmail.com"]);
    expect(out.cc).toEqual([]);
    // The header records who survived the allow list, not who was queued.
    expect(out.headers?.["X-Original-To"]).toBe("real@gmail.com");
    expect(out.headers?.["X-Original-Cc"]).toBeUndefined();
  });
});

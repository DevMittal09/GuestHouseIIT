import fs from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUploadName, sniffUploadType, stripMetadata } from "@/lib/uploads";
import type { DataStore } from "@/lib/store/types";
import type { NewBookingInput } from "@/lib/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * Uploads, encryption at rest and retention (Phase 8c): what is accepted,
 * what is stripped, and what is erased when a stay is old enough.
 */

const jpeg = (extra: Buffer = Buffer.alloc(0)) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    extra,
    Buffer.from([0xff, 0xda, 0x00, 0x02]), // SOS: image data follows
    Buffer.from("image-bytes"),
  ]);

const app1Exif = Buffer.concat([
  Buffer.from([0xff, 0xe1]),
  Buffer.from([0x00, 0x10]), // length 16
  Buffer.from("Exif\0\0GPS-here"),
]);

describe("what may be uploaded", () => {
  it("decides the type from the bytes, not the name", () => {
    expect(sniffUploadType(jpeg(Buffer.from([0xff, 0xe0, 0x00, 0x02])))).toBe("image/jpeg");
    expect(sniffUploadType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))).toBe("image/png");
    expect(sniffUploadType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffUploadType(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    // A script that calls itself a PDF is refused.
    expect(sniffUploadType(Buffer.from("<?php system($_GET['c']); ?>"))).toBeNull();
    expect(sniffUploadType(Buffer.from("MZ"))).toBeNull();
  });

  it("strips camera metadata from a JPEG, keeping the image", () => {
    const withExif = jpeg(app1Exif);
    expect(withExif.includes("GPS-here")).toBe(true);
    const cleaned = Buffer.from(stripMetadata(withExif, "image/jpeg"));
    expect(cleaned.includes("GPS-here")).toBe(false);
    expect(cleaned.includes("image-bytes")).toBe(true);
    expect(cleaned.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("strips text chunks from a PNG", () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunk = (type: string, body: string) => {
      const data = Buffer.from(body);
      const out = Buffer.alloc(12 + data.length);
      out.writeUInt32BE(data.length, 0);
      out.write(type, 4, "ascii");
      data.copy(out, 8);
      return out;
    };
    const png = Buffer.concat([signature, chunk("tEXt", "Software=Camera"), chunk("IDAT", "pixels"), chunk("IEND", "")]);
    const cleaned = Buffer.from(stripMetadata(png, "image/png"));
    expect(cleaned.includes("Software=Camera")).toBe(false);
    expect(cleaned.includes("pixels")).toBe(true);
  });

  it("throws the uploader's filename away", () => {
    const name = randomUploadName("image/jpeg");
    expect(name).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(randomUploadName("application/pdf")).toMatch(/\.pdf$/);
    expect(randomUploadName("image/jpeg")).not.toBe(name);
  });
});

// ------------------------------------------------------------------ the store

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;
beforeAll(async () => {
  process.env.ID_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  await store.listProfiles();
});
afterAll(() => {
  delete process.env.ID_ENCRYPTION_KEY;
  db.cleanup();
});

const input = (checkOut: string): NewBookingInput => ({
  user_id: "employee-priya",
  guest_house_id: "gh-bageshri",
  user_role: "employee",
  status: "VACATED",
  purpose_of_visit: "Visit",
  check_in: "2024-01-01T08:30:00.000Z",
  check_out: checkOut,
  booking_type: "official",
  service_type: "room",
  debit_head: "department_budget",
  debit_details: null,
  debit_document_url: null,
  meal_preference: null,
  meal_guest_count: null,
  pets_policy_acknowledged: true,
  privacy_notice_version: "2026-09-22",
  alumni_name: null,
  alumni_roll_number: null,
  alumni_id_url: null,
  custom_fields: null,
  meals: [],
  rooms: [
    {
      room_type: null,
      guests: [
        {
          name: "Guest One",
          age: 40,
          gender: "female",
          relationship: null,
          id_number: "1234 5678 9012",
          id_document_url: "guest-ids/abc.jpg",
          is_infant: false,
          citizenship: "indian",
          nationality: null,
          passport_number: null,
        },
      ],
    },
  ],
});

describe("identity numbers at rest", () => {
  it("are encrypted in the file and decrypted on read", async () => {
    const booking = await store.createBooking(input("2024-01-03T05:30:00.000Z"));
    const raw = JSON.parse(fs.readFileSync(db.file, "utf8")) as { booking_guests: { id_number: string }[] };
    const stored = raw.booking_guests.find((g) => g.id_number?.startsWith("enc:"));
    expect(stored).toBeTruthy();
    expect(JSON.stringify(raw)).not.toContain("1234 5678 9012");
    const read = await store.getBooking(booking.id);
    expect(read?.guests[0].id_number).toBe("1234 5678 9012");
    expect(read?.privacy_notice_version).toBe("2026-09-22");
    expect(read?.privacy_consent_at).toBeTruthy();
  });
});

describe("retention", () => {
  it("clears identity fields of old stays and keeps the booking", async () => {
    const old = await store.createBooking(input("2024-01-03T05:30:00.000Z"));
    const recent = await store.createBooking(input(new Date().toISOString()));
    const purged = await store.purgeGuestIdentities("2025-01-01T00:00:00.000Z");
    expect(purged.bookings).toBeGreaterThanOrEqual(1);
    expect(purged.documents).toContain("guest-ids/abc.jpg");

    const cleared = await store.getBooking(old.id);
    expect(cleared).toBeTruthy(); // the stay itself is kept
    expect(cleared?.guests[0].id_number).toBeNull();
    expect(cleared?.guests[0].id_document_url).toBeNull();
    expect(cleared?.check_out).toBe("2024-01-03T05:30:00.000Z");

    const kept = await store.getBooking(recent.id);
    expect(kept?.guests[0].id_number).toBe("1234 5678 9012");

    // Running again finds nothing left to do.
    expect((await store.purgeGuestIdentities("2025-01-01T00:00:00.000Z")).bookings).toBe(0);
  });

  it("never trims the audit log below 180 days", async () => {
    await store.appendAudit({
      actor_id: null,
      actor_name: "System",
      actor_role: null,
      event: "signin.success",
      target: "old@iitpkd.ac.in",
      details: {},
      ip: null,
      user_agent: null,
    });
    const before = (await store.listAudit({ limit: 100 })).length;
    expect(await store.purgeAudit(1)).toBe(0); // today's row is well inside 180 days
    expect((await store.listAudit({ limit: 100 })).length).toBe(before);
  });
});

describe("a person's own data", () => {
  it("records an erasure request once, and the office's answer", async () => {
    const created = await store.createPrivacyRequest({ user_id: "employee-priya", kind: "deletion", note: "Please remove" });
    expect((await store.listPrivacyRequests({ userId: "employee-priya" })).filter((r) => r.status === "open")).toHaveLength(1);
    await store.resolvePrivacyRequest(created.id, { status: "done", response: "ID numbers erased; stay record kept for audit", handledBy: "gh-manager" });
    const after = await store.listPrivacyRequests({ userId: "employee-priya" });
    expect(after[0].status).toBe("done");
    expect(after[0].handled_by).toBe("gh-manager");
    expect(after.filter((r) => r.status === "open")).toHaveLength(0);
  });
});

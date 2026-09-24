"use server";

import { revalidatePath } from "next/cache";
import { hasFullBookingAccess } from "@/lib/access";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import { maskIdNumber, type PrivacyRequest } from "@/lib/security";
import { getStore } from "@/lib/store";
import { toInstituteDateValue } from "@/lib/tz";
import type { ActionResult } from "./bookings";

/**
 * What a person may do about their own data (Phase 8, DPDP): take a copy of
 * it, and ask for it to be erased. Erasure is a *request*, not a switch: the
 * guest house has to keep a record of who stayed, so the office answers each
 * one and the answer is kept with it.
 */

/** Everything the portal holds about the person asking, as JSON. */
export async function exportMyData(): Promise<
  { ok: true; json: string; filename: string } | { ok: false; error: string }
> {
  try {
    const user = await requireUser();
    const store = getStore();
    const bookings = await store.listBookingsForUser(user.id);
    const invoices = bookings.length
      ? await store.listInvoices({ bookingIds: bookings.map((b) => b.id) }).catch(() => [])
      : [];
    const data = {
      exported_at: new Date().toISOString(),
      notice: "Your own copy of what the guest house portal holds about you. ID numbers are shown as their last four digits only; the documents themselves are not included — ask the guest house office for those.",
      account: {
        name: user.full_name,
        email: user.email,
        role: user.role,
        department_or_club: user.department_or_club,
        hostel: user.hostel_name,
        roll_number: user.roll_number,
      },
      bookings: bookings.map((b) => ({
        reference: b.booking_reference_id,
        guest_house: b.guest_house?.name,
        status: b.status,
        check_in: b.check_in,
        check_out: b.check_out,
        purpose: b.purpose_of_visit,
        rooms: b.assigned_rooms.map((r) => r.room_number),
        meals: b.meals,
        debitable_head: b.debit_head,
        project_subhead: b.debit_subhead ?? null,
        // Addresses the requester chose to copy on this booking's mail.
        copy_to: b.copy_to_emails ?? [],
        privacy_notice_version: b.privacy_notice_version ?? null,
        consent_at: b.privacy_consent_at ?? null,
        guests: b.guests.map((g) => ({
          name: g.name,
          age: g.age,
          gender: g.gender,
          relationship: g.relationship,
          citizenship: g.citizenship,
          nationality: g.nationality,
          id_number: maskIdNumber(g.id_number),
          passport_number: maskIdNumber(g.passport_number),
          id_document_on_file: Boolean(g.id_document_url),
        })),
        history: b.logs.map((l) => ({ at: l.timestamp, status: l.new_status, by: l.action_by_name, remarks: l.remarks })),
      })),
      invoices: invoices
        .filter((i) => i.status !== "draft")
        .map((i) => ({
          number: i.invoice_number,
          issued_at: i.issued_at,
          status: i.status,
          grand_total: i.grand_total,
          paid_at: i.paid_at,
        })),
    };
    await recordAudit(user, "privacy.data_export", user.email, { bookings: bookings.length });
    return {
      ok: true,
      json: JSON.stringify(data, null, 2),
      filename: `my-guest-house-data-${toInstituteDateValue(new Date())}.json`,
    };
  } catch (e) {
    console.error("exportMyData failed", e);
    return { ok: false, error: "Could not prepare your data — try again shortly" };
  }
}

/** Ask the office to erase what it holds. The office answers; nothing is automatic. */
export async function requestDataDeletion(note: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const store = getStore();
    const open = (await store.listPrivacyRequests({ userId: user.id })).filter((r) => r.status === "open");
    if (open.length > 0) return { ok: false, error: "You already have a request open — the office will reply by email" };
    await store.createPrivacyRequest({ user_id: user.id, kind: "deletion", note: note.trim().slice(0, 1000) || null });
    await recordAudit(user, "privacy.deletion_requested", user.email, {});
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    console.error("requestDataDeletion failed", e);
    return { ok: false, error: "Could not record your request — please email the guest house office" };
  }
}

export type PrivacyRequestRow = PrivacyRequest & { person: string; email: string };

/** Open requests for the office (manager and developer). */
export async function listPrivacyRequestsForConsole(): Promise<
  { ok: true; requests: PrivacyRequestRow[] } | { ok: false; error: string }
> {
  try {
    const user = await requireUser();
    if (!hasFullBookingAccess(user.role)) return { ok: false, error: "Only the guest house office can see these" };
    const store = getStore();
    const [requests, profiles] = await Promise.all([store.listPrivacyRequests({}), store.listProfiles()]);
    return {
      ok: true,
      requests: requests.map((r) => {
        const who = profiles.find((p) => p.id === r.user_id);
        return { ...r, person: who?.full_name ?? "A removed account", email: who?.email ?? "" };
      }),
    };
  } catch (e) {
    console.error("listPrivacyRequestsForConsole failed", e);
    return { ok: false, error: "Could not read the requests" };
  }
}

/** Record what the office did about a request, and tell the person. */
export async function resolvePrivacyRequestAction(
  id: string,
  status: "done" | "refused",
  response: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!hasFullBookingAccess(user.role)) return { ok: false, error: "Only the guest house office can answer these" };
    if (!response?.trim()) return { ok: false, error: "Say what was done — the person is told" };
    await getStore().resolvePrivacyRequest(id, { status, response: response.trim().slice(0, 1000), handledBy: user.id });
    await recordAudit(user, "privacy.deletion_requested", id, { status, response: response.trim().slice(0, 200) });
    revalidatePath("/admin/security");
    return { ok: true };
  } catch (e) {
    console.error("resolvePrivacyRequestAction failed", e);
    return { ok: false, error: "Could not record the answer" };
  }
}

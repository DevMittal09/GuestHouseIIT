import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { hasFullBookingAccess } from "@/lib/access";
import { recordAudit } from "@/lib/audit-server";
import { getCurrentUser } from "@/lib/auth";
import { RATE_LIMITS } from "@/lib/security";
import { getStore } from "@/lib/store";
import { actsAsRequester, canReview } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/**
 * An uploaded document — an ID card, a passport page, an alumni card, a
 * sanction letter (Phase 8).
 *
 * Nothing is served by filename: the store keeps a path, this route decides
 * who may see it, and only then hands out a **five-minute** signed link (or,
 * on the mock store, streams the file itself from outside `public/`). Who may:
 * the desk and the developer, the person who made the booking, and whoever it
 * is waiting on for approval. Every view is written to the audit log, because
 * "who looked at this guest's Aadhaar" is exactly the question an incident
 * asks.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in to see this document", { status: 401 });
  const stored = (await params).path.map(decodeURIComponent).join("/");
  // No traversal, however the segments arrived.
  if (stored.includes("..") || stored.startsWith("/")) return new NextResponse("Not found", { status: 404 });

  const store = getStore();
  try {
    const gate = await store.hitRateLimit(`documents:${user.id}`, RATE_LIMITS.documents.limit, RATE_LIMITS.documents.windowSeconds);
    if (!gate.allowed) {
      return new NextResponse("Too many document requests — slow down.", {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfter) },
      });
    }
  } catch {
    // No throttle table yet; carry on.
  }

  const owner = await store.findDocumentOwner(stored);
  if (!owner) return new NextResponse("Not found", { status: 404 });
  const booking = await store.getBooking(owner.bookingId);
  if (!booking) return new NextResponse("Not found", { status: 404 });

  const units = await store.listUnits().catch(() => []);
  const allowed =
    hasFullBookingAccess(user.role) ||
    // The requester, or the faculty in-charge who raised a club's booking.
    actsAsRequester(booking, user.id) ||
    canReview(user, booking.status, booking.requester, units);
  // Not found rather than forbidden: whether a document exists is itself
  // something only the people above should learn.
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  await recordAudit(user, "document.viewed", stored, { booking: booking.booking_reference_id });

  const url = await store.documentUrl(stored, 300);
  if (!url) return new NextResponse("Not found", { status: 404 });
  // The mock store answers with this very route; stream the file instead.
  if (url.startsWith("/api/documents/")) {
    const file = path.join(process.cwd(), ".uploads", stored);
    if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
    const body = new Uint8Array(fs.readFileSync(file));
    const ext = path.extname(file).toLowerCase();
    const type = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(Buffer.from(body), {
      headers: { "Content-Type": type, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
}

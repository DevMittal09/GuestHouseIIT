import { NextResponse } from "next/server";
import { canIssueInvoices } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { buildInvoiceDocument } from "@/lib/invoice";
import { invoiceFilename, renderInvoicePdf } from "@/lib/invoice-pdf";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";

/**
 * The desk's print preview of an invoice not yet issued: priced now, with the
 * saved meal-count correction and additional charges, and marked DRAFT across
 * the page. Nothing is numbered or stored.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canIssueInvoices(user.role)) return new NextResponse("Not found", { status: 404 });
  const { bookingId } = await params;
  const store = getStore();
  const booking = await store.getBooking(bookingId);
  if (!booking) return new NextResponse("Not found", { status: 404 });
  const [rules, tariffs, invoices] = await Promise.all([
    getRules(),
    store.listTariffs(),
    store.listInvoices({ bookingId }).catch(() => []),
  ]);
  const draft = invoices.find((i) => i.status === "draft");
  const document = buildInvoiceDocument(booking, {
    tariffs,
    rules: rules.invoice,
    capacity: rules.capacity,
    mealCounts: draft?.meal_counts ?? null,
    extraCharges: draft?.extra_charges ?? [],
  });
  return new NextResponse(Buffer.from(renderInvoicePdf(document, null)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFilename(document)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { NextResponse } from "next/server";
import { canIssueInvoices } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { invoiceFilename, renderInvoicePdf } from "@/lib/invoice-pdf";
import { getStore } from "@/lib/store";
import { actsAsRequester } from "@/lib/workflow";

/**
 * An issued invoice as a PDF, drawn from its snapshot (Phase 5). The desk may
 * open any; the person who made the booking may open their own, once issued
 * (never a draft). `?download=1` saves instead of opening for print.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in to see this invoice", { status: 401 });
  const { id } = await params;
  const store = getStore();
  const invoice = await store.getInvoice(id).catch(() => null);
  if (!invoice || !invoice.document || invoice.status === "draft") {
    return new NextResponse("Invoice not found", { status: 404 });
  }
  if (!canIssueInvoices(user.role)) {
    const booking = await store.getBooking(invoice.booking_id);
    // Not found rather than forbidden: do not confirm the invoice exists.
    // The requester, or the faculty in-charge who raised a club's booking.
    if (!booking || !actsAsRequester(booking, user.id)) return new NextResponse("Invoice not found", { status: 404 });
  }
  const pdf = renderInvoicePdf(invoice.document, invoice);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceFilename(invoice.document)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

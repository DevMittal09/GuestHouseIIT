import { formatINR, toPaise } from "@/lib/invoice";
import type { TariffPreview } from "@/lib/tariffs";
import type { BookingType } from "@/lib/types";

/**
 * The rates for the guest house being booked, on the booking form (7 Oct
 * 2026, the office's eighth list).
 *
 * The figures come from `tariffPreviews`, which resolves them with the same
 * function the invoice uses (`resolveTariff`), so what the requester is
 * quoted here and what the desk charges at check-out cannot drift apart.
 * Computed on the server and handed down as a prop: one preview per guest
 * house and booking type the requester may choose, which is a handful of rows
 * and no round trip while they fill the form in.
 *
 * The figures are the rates **in force today** (a stay crossing a rate change
 * is priced night by night when it is invoiced), and a charge the office has
 * not set a rate for reads "Not published" rather than a zero, which is what
 * the invoice does with it too. Neither is written out on the form any more
 * (9 Oct 2026): the office asked for the table and nothing beside it, and
 * both facts are on the Guidelines page.
 */
export function TariffTable({
  previews,
  guestHouseId,
  bookingType,
  guestHouseName,
  pricesIncludeGst,
}: {
  previews: TariffPreview[];
  guestHouseId: string;
  bookingType: BookingType;
  guestHouseName?: string;
  /** Settings → Tariffs & Invoicing: whether the office's rates include GST. */
  pricesIncludeGst: boolean;
}) {
  const preview = previews.find(
    (p) => p.guest_house_id === guestHouseId && p.booking_type === bookingType
  );

  if (!guestHouseId) {
    return (
      <p className="text-sm text-muted-foreground">
        Choose a guest house to see its rates.
      </p>
    );
  }
  if (!preview || preview.lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rates have been published for this guest house yet. The guest house office will confirm
        the charges on your invoice.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Rates at {guestHouseName ?? "this guest house"}, in force today
          </caption>
          <thead className="bg-band text-left">
            <tr>
              <th scope="col" className="p-2 font-medium">
                Charge
              </th>
              <th scope="col" className="p-2 text-right font-medium">
                Rate ({pricesIncludeGst ? "incl. GST" : "before GST"})
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => (
              <tr key={line.item} className="border-t">
                <td className="p-2">{line.label}</td>
                <td className="p-2 text-right tabular-nums">
                  {line.rate === null ? (
                    <span className="text-muted-foreground">Not published</span>
                  ) : (
                    formatINR(toPaise(line.rate))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

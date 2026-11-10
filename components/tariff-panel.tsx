"use client";

import { formatINR, toPaise } from "@/lib/invoice";
import { TariffTable } from "@/components/tariff-table";
import { mealTimetable } from "@/lib/site-content";
import type { TariffSheetRow } from "@/lib/tariff-category";
import { TARIFF_CATEGORY_LABELS, tariffCategoriesFor } from "@/lib/tariff-category";
import type { TariffPreview } from "@/lib/tariffs";
import type { BookingType, GuestHouse } from "@/lib/types";
import type { Rules } from "@/lib/settings";

/**
 * **The tariff and the catering times, beside the form and for reading only**
 * (9 Nov 2026, the meeting, requirements 5.1-5.3: an information section on
 * the right of the booking page holding the room tariff table and the
 * catering timings, and "the tariff table is informational only - users must
 * not be able to select a tariff category from this table").
 *
 * ## What changed, and why it is a reversal
 *
 * From 17 Oct 2026 this panel **asked** the requester which category applied,
 * because a "category" then meant the (guest house, booking type) pair - the
 * two fields a rate is resolved from - so selecting one wrote two answers the
 * form needed anyway and the quote could not drift from the invoice.
 *
 * The meeting withdrew the question. The office's categories are kinds of
 * **guest**, not kinds of account: whether the person arriving is an external
 * examiner, an academic visitor or somebody's parent is something only the
 * desk knows, and a requester choosing their own category is a requester
 * choosing their own rate. So the category is now stored on the booking and
 * set by the Guest House Manager at allocation
 * (`lib/tariff-category.ts`), and this panel states the whole sheet instead:
 * every category, what each is for and what each costs at each guest house.
 *
 * The guest house and the booking type are **still asked, on the form**,
 * where they always were - they were never this panel's to ask, only its to
 * write.
 *
 * ## Why the figures are not written into the page
 *
 * They are read from the `tariffs` rows, resolved on the server by the same
 * function the invoice prices from (`tariffCategorySheet` ->
 * `resolveTariff`). The office raises a rate from Console -> Tariffs &
 * Invoicing and this table follows, with no deploy - which is the reason the
 * rates are effective-dated rows and not a constant.
 */
export function TariffPanel({
  sheet,
  guestHouses,
  previews,
  guestHouseId,
  bookingType,
  pricesIncludeGst,
  rules,
  mealsOnly = false,
}: {
  /** One row per category, with the room rate per guest house. */
  sheet: TariffSheetRow[];
  /** The guest houses the table has a column for, in order. */
  guestHouses: Pick<GuestHouse, "id" | "name">[];
  previews: TariffPreview[];
  guestHouseId: string;
  bookingType: BookingType;
  /** Settings -> Tariffs & Invoicing: whether the office's rates include GST. */
  pricesIncludeGst: boolean;
  /** For the catering times, which are the meal serving windows in Settings. */
  rules: Rules;
  mealsOnly?: boolean;
  /** Whether the guest house being booked has a kitchen at all. */
  servesMeals: boolean;
}) {
  const guestHouseName = guestHouses.find((g) => g.id === guestHouseId)?.name;
  /**
   * **Only the categories this kind of booking can be charged at** (10 Nov
   * 2026, the owner: "category we dont need to show all categories for
   * personal bookings and all"). Filtered here rather than on the server
   * because the booking type is a live answer on the form - an employee
   * switching from Official to Personal must see the panel follow.
   */
  const applicable = tariffCategoriesFor(bookingType);
  const rows = sheet.filter((row) => applicable.includes(row.category));
  const published = rows.some((row) =>
    guestHouses.some((g) => row.rateByGuestHouse[g.id] !== null)
  );

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="tariff-panel-heading"
        className="space-y-3 border border-border-strong bg-white p-4"
      >
        <h2 id="tariff-panel-heading" className="text-card font-semibold text-ink">
          {mealsOnly ? "Meal rates" : "Room tariff"}
        </h2>

        {/* The office's own table: the category, who it is for, and the rate
            at each guest house. Not shown on a dining booking, which holds no
            room and so has no category - its meal rates are the table below. */}
        {!mealsOnly &&
          (published ? (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-ink bg-band text-left">
                      <th scope="col" className="px-2 py-1.5 font-semibold">
                        Category
                      </th>
                      {guestHouses.map((house) => (
                        <th
                          key={house.id}
                          scope="col"
                          className="px-2 py-1.5 text-right font-semibold"
                        >
                          {house.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.category} className="border-b border-border last:border-0">
                        <th scope="row" className="px-2 py-2 text-left align-top font-normal">
                          <span className="block font-medium text-ink">
                            {TARIFF_CATEGORY_LABELS[row.category]}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {row.guests}
                          </span>
                        </th>
                        {guestHouses.map((house) => {
                          const rate = row.rateByGuestHouse[house.id];
                          return (
                            <td
                              key={house.id}
                              className="px-2 py-2 text-right align-top tabular-nums"
                            >
                              {rate === null ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <span className="figure-serif text-[1.0625rem] text-ink">
                                  {formatINR(toPaise(rate))}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Two facts the table cannot carry, and the one the meeting
                  asked for in so many words: which category applies is the
                  office's decision, not a question on this form. */}
              <p className="text-xs text-muted-foreground">
                Per room per day.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No rates have been published yet. The guest house office will confirm the charges on
              your invoice.
            </p>
          ))}

        {/* The other charges at the guest house being booked - an extra bed,
            and the meals where there is a kitchen. The table that has stood
            here since 7 Oct 2026, still resolved by the function the invoice
            prices from.

            **The room row is taken out of it** (9 Nov 2026). It used to quote
            one room rate, resolved from the guest house, the booking type and
            the requester's role - and from this round the room rate is
            decided by the **category the manager picks**, which this page
            cannot know. Leaving it in would have printed a single figure
            directly beneath a table giving three different ones, and the
            figure would have been the one nobody chose. The room rates are
            the category table above; this is everything else. */}
        {guestHouseId && (
          <TariffTable
            previews={previews.map((preview) => ({
              ...preview,
              lines: preview.lines.filter((line) => line.item !== "room"),
            }))}
            guestHouseId={guestHouseId}
            bookingType={bookingType}
            guestHouseName={guestHouseName}
            pricesIncludeGst={pricesIncludeGst}
          />
        )}
      </section>

      {/* **Catering timings** (requirement 5.3). Drawn from the meal serving
          windows in Settings - the same windows that decide which cells of
          the meal grid a stay is offered - so the times on the page and the
          times the kitchen is held to are one value. Withheld where the guest
          house has no kitchen: there is nothing to state. */}
      {(
        <section
          aria-labelledby="catering-panel-heading"
          className="space-y-3 border border-border-strong bg-white p-4"
        >
          <h2 id="catering-panel-heading" className="text-card font-semibold text-ink">
            Catering timings
          </h2>
          <dl className="divide-y divide-border text-sm">
            {mealTimetable(rules).map((row) => (
              <div key={row.meal} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="font-medium text-ink">{row.meal}</dt>
                <dd className="tabular-nums text-body">{row.time}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

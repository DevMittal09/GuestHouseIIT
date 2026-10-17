"use client";

import { formatINR, toPaise } from "@/lib/invoice";
import { TariffTable } from "@/components/tariff-table";
import type { TariffCategory } from "@/lib/tariff-categories";
import type { TariffPreview } from "@/lib/tariffs";
import type { BookingType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * **The tariff, beside the form rather than in it** (17 Oct 2026, the owner:
 * keep the categories and their rates on the right-hand side of the booking
 * page and let the requester select the one that applies).
 *
 * It was a numbered section in the middle of the form, between the stay and
 * the meals, and it answered nothing - the rate was already decided by the
 * guest house and the kind of booking chosen a few lines above. Here it is
 * the panel the requester reads while they fill the form in, sticky with the
 * requester's own details, and **the category is a question**: picking one
 * sets the guest house and the booking type, which is what the rate is
 * resolved from (`lib/tariff-categories.ts`).
 *
 * A requester with one eligible category is told it rather than asked - the
 * same rule as the guest house and the booking type, neither of which is a
 * dropdown with one position.
 */
export function TariffPanel({
  categories,
  previews,
  guestHouseId,
  bookingType,
  pricesIncludeGst,
  onSelect,
  mealsOnly = false,
}: {
  categories: TariffCategory[];
  previews: TariffPreview[];
  guestHouseId: string;
  bookingType: BookingType;
  /** Settings -> Tariffs & Invoicing: whether the office's rates include GST. */
  pricesIncludeGst: boolean;
  /** Writes the guest house and booking type the chosen category stands for. */
  onSelect: (category: TariffCategory) => void;
  mealsOnly?: boolean;
}) {
  const selected = categories.find(
    (c) => c.guest_house_id === guestHouseId && c.booking_type === bookingType
  );
  const guestHouseName = categories.find((c) => c.guest_house_id === guestHouseId)?.guest_house_name;

  return (
    <section
      aria-labelledby="tariff-panel-heading"
      className="space-y-3 border border-border-strong bg-white p-4"
    >
      <h2 id="tariff-panel-heading" className="text-card font-semibold text-ink">
        {mealsOnly ? "Meal rates" : "Tariff"}
      </h2>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rates have been published yet. The guest house office will confirm the charges on your
          invoice.
        </p>
      ) : categories.length === 1 ? (
        /* One category is a statement, not a question. */
        <p className="text-sm font-medium text-ink">{categories[0].label}</p>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm text-muted-foreground">
            Which rate applies to this booking
          </legend>
          {categories.map((category) => {
            const active = category.key === selected?.key;
            return (
              <label
                key={category.key}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded border px-3 py-2 text-sm transition-colors",
                  active ? "border-ink bg-band/70" : "border-border hover:border-border-strong"
                )}
              >
                <input
                  type="radio"
                  name="tariff_category"
                  value={category.key}
                  checked={active}
                  onChange={() => onSelect(category)}
                  className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{category.label}</span>
                  {category.headline && (
                    <span className="mt-0.5 block text-muted-foreground">
                      {category.headline.rate === null ? (
                        "Rate not published"
                      ) : (
                        <>
                          <span className="figure-serif text-[1.0625rem] text-ink">
                            {formatINR(toPaise(category.headline.rate))}
                          </span>{" "}
                          per room per day
                        </>
                      )}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {/* Every charge the chosen category resolves to - the table that used to
          stand in the form, unchanged, so what is quoted here is still what
          the invoice prices. Until one is chosen there is nothing to price:
          the table's own "choose a guest house" line would be answering a
          question the list above is already asking. */}
      {selected ? (
        <TariffTable
          previews={previews}
          guestHouseId={guestHouseId}
          bookingType={bookingType}
          guestHouseName={guestHouseName}
          pricesIncludeGst={pricesIncludeGst}
        />
      ) : (
        categories.length > 0 && (
          <p className="text-sm text-muted-foreground">Choose one to see every charge.</p>
        )
      )}
    </section>
  );
}

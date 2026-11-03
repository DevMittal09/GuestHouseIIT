import { formatINR, toPaise } from "@/lib/invoice";
import { TariffTable } from "@/components/tariff-table";
import type { TariffCategory } from "@/lib/tariff-categories";
import type { TariffPreview } from "@/lib/tariffs";

/**
 * **The tariff, beside the form and not a question in it** (17 Oct 2026, the
 * owner: keep the categories and their rates on the right-hand side of the
 * booking page; **31 Oct 2026**, the owner: "remove all interactive selection
 * functionality from this table ... users should only be able to view the
 * different tariff categories and their corresponding prices").
 *
 * It was a numbered section in the middle of the form, then a panel here with
 * the category as a radio - picking one wrote the guest house and the booking
 * type, which is what a rate is resolved from. That made the requester the
 * person who decided which published rate they would be charged at, and the
 * office's sheet has rates that are a judgement about the visit rather than a
 * fact about the account filling the form in. **The decision moved to the
 * Guest House Manager**, who makes it when they approve
 * (`components/tariff-category-choice.tsx`), and this panel is what is left:
 * every category the requester could fall under, with its charges, so they
 * know the rates before they ask and can check the invoice against them
 * afterwards.
 *
 * The guest house and the kind of booking are still the requester's to answer
 * - they are questions on the form itself, where they always were, and they
 * are not what this panel is for.
 *
 * It is a server component again: with nothing to select there is no state,
 * no selection handler and no reason for it to be on the client.
 */
export function TariffPanel({
  categories,
  previews,
  pricesIncludeGst,
  mealsOnly = false,
}: {
  /** Every category this requester could be charged under, with its rates. */
  categories: TariffCategory[];
  previews: TariffPreview[];
  /** Settings -> Tariffs & Invoicing: whether the office's rates include GST. */
  pricesIncludeGst: boolean;
  mealsOnly?: boolean;
}) {
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
      ) : (
        <>
          {/* **One fact, and it is not a rule this form enforces**: the
              requester is reading a price list they have no say over, and
              without this line four categories read as four options. */}
          <p className="text-sm text-muted-foreground">
            The Guest House Manager confirms which category applies.
          </p>
          <div className="space-y-4">
            {categories.map((category) => (
              <div key={category.key} className="space-y-1.5">
                {/* A single category needs no heading: there is nothing to
                    tell apart, and the guest house is named on the form. */}
                {categories.length > 1 && (
                  <div>
                    <h3 className="text-sm font-medium text-ink">{category.label}</h3>
                    {category.headline && category.headline.rate !== null && (
                      <p className="text-sm text-muted-foreground">
                        <span className="figure-serif text-[1.0625rem] text-ink">
                          {formatINR(toPaise(category.headline.rate))}
                        </span>{" "}
                        per room per day
                      </p>
                    )}
                  </div>
                )}
                <TariffTable
                  previews={previews}
                  guestHouseId={category.guest_house_id}
                  bookingType={category.booking_type}
                  guestHouseName={category.guest_house_name}
                  categoryLabel={categories.length > 1 ? category.label : undefined}
                  pricesIncludeGst={pricesIncludeGst}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

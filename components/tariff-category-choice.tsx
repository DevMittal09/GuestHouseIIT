"use client";

import { formatINR, toPaise } from "@/lib/invoice";
import type { DeskTariffCategory } from "@/lib/tariff-categories";
import { cn } from "@/lib/utils";

/**
 * **The tariff category, asked of the Guest House Manager as they approve**
 * (31 Oct 2026, the owner: "the GHM must select the appropriate category
 * based on the actual nature of the booking", and the invoice must reflect
 * that rather than anything the requester picked).
 *
 * The list is the office's own rate sheet (`deskTariffCategories`), so a rate
 * the office publishes this afternoon is on this screen this afternoon. The
 * category the booking's own facts resolve to is offered first and marked:
 * it is the answer in most cases, it is what every invoice before this round
 * was priced at, and a reviewer can check it against the request in front of
 * them.
 *
 * **One category is stated, not asked** - the same rule as the guest house and
 * the booking type on the form. A radio group with one position is a question
 * the screen has already answered, and the server takes the only category as
 * given rather than refusing an approval over it.
 */
export function TariffCategoryChoice({
  categories,
  value,
  onChange,
  name = "desk_tariff_category",
}: {
  categories: DeskTariffCategory[];
  /** The chosen key, or null before the manager has answered. */
  value: string | null;
  onChange: (category: DeskTariffCategory) => void;
  /** Distinct per dialog, so two open rows cannot share a radio group. */
  name?: string;
}) {
  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-band/60 p-4">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Tariff category
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No rate is published for these charges, so there is no category to choose. The invoice
          will say which rate is missing.
        </p>
      </div>
    );
  }

  const only = categories.length === 1 ? categories[0] : null;

  return (
    <fieldset className="rounded-lg border border-border bg-band/60 p-4">
      <legend className="px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Tariff category
      </legend>
      {only ? (
        <p className="text-sm text-ink">
          <span className="font-medium">{only.label}</span>
          {only.headline?.rate != null && (
            <>
              {" · "}
              <span className="figure-serif text-[1.0625rem]">
                {formatINR(toPaise(only.headline.rate))}
              </span>{" "}
              per room per day
            </>
          )}
        </p>
      ) : (
        <div className="space-y-1.5">
          {categories.map((category) => {
            const active = category.key === value;
            return (
              <label
                key={category.key}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded border bg-white px-3 py-2 text-sm transition-colors",
                  active ? "border-ink bg-band/70" : "border-border hover:border-border-strong"
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={category.key}
                  checked={active}
                  onChange={() => onChange(category)}
                  className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {category.label}
                    {/* Plain text, not a badge: this is a classification, and
                        a badge is for a state (`StatusBadge`). */}
                    {category.requesters && (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        - as requested
                      </span>
                    )}
                  </span>
                  {category.scope_label !== category.label && (
                    <span className="block text-xs text-muted-foreground">
                      {category.scope_label}
                    </span>
                  )}
                  <span className="mt-0.5 block text-muted-foreground">
                    {category.lines.every((line) => line.rate === null)
                      ? "Rates not published"
                      : category.lines
                          .filter((line) => line.rate !== null)
                          .map((line) => `${line.label} ${formatINR(toPaise(line.rate ?? 0))}`)
                          .join(" · ")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

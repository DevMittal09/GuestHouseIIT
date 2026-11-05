import Link from "next/link";
import { formatINR, toPaise } from "@/lib/invoice";
import type { TariffSheetRow } from "@/lib/tariff-categories";

/**
 * **The right-hand side of the booking page** (4 Nov 2026, the owner's
 * sixteenth list: "the Tariff Table and Catering Timings must be displayed on
 * the right side of the booking page so users can view the rates and meal
 * schedules", and a Guidelines button that opens the office's Google Drive
 * document).
 *
 * Three read-only panels, server-rendered and handed to the form as its
 * aside. Nothing here is a question: which category applies is the Guest
 * House Manager's to decide on approval, and the timings are the kitchen's.
 */

/** Table 1 - the room tariff, categories down, guest houses across. */
export function TariffSheet({
  rows,
  otherCharges = [],
  guestHouses,
  pricesIncludeGst,
}: {
  rows: TariffSheetRow[];
  /** An extra bed and meals, at this requester's rates (`otherChargesFrom`). */
  otherCharges?: TariffSheetRow[];
  guestHouses: { id: string; name: string }[];
  pricesIncludeGst: boolean;
}) {
  const columns = guestHouses.filter((g) => rows.some((r) => g.id in r.rates));
  const otherColumns = guestHouses.filter((g) => otherCharges.some((r) => g.id in r.rates));
  return (
    <section
      aria-labelledby="tariff-sheet-heading"
      className="space-y-3 border border-border-strong bg-white p-4"
    >
      <h2 id="tariff-sheet-heading" className="text-card font-semibold text-ink">
        Room tariff
      </h2>
      {rows.length === 0 || columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rates have been published yet. The guest house office will confirm the charges on your
          invoice.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Per room per day{pricesIncludeGst ? ", GST included" : ", plus GST"}. The Guest House
            Manager confirms which category applies.
          </p>
          <table className="w-full text-sm">
            <caption className="sr-only">Room tariff per day, by category and guest house</caption>
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="py-1.5 pr-2 text-left font-medium text-muted-foreground">
                  Category
                </th>
                {columns.map((g) => (
                  <th key={g.id} scope="col" className="py-1.5 pl-2 text-right font-medium text-ink">
                    {g.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.title} className="border-b border-border align-top last:border-b-0">
                  <th scope="row" className="py-2 pr-2 text-left font-normal">
                    <span className="block font-medium text-ink">{row.title}</span>
                    {row.description && (
                      <span className="block text-xs text-muted-foreground">{row.description}</span>
                    )}
                  </th>
                  {columns.map((g) => (
                    <td key={g.id} className="py-2 pl-2 text-right text-ink tabular-nums">
                      {row.rates[g.id] == null ? "-" : formatINR(toPaise(row.rates[g.id] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {otherCharges.length > 0 && otherColumns.length > 0 && (
        <table className="w-full text-sm">
          <caption className="pb-1.5 text-left text-xs font-medium text-muted-foreground">
            Extra bed and meals
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Charge</th>
              {otherColumns.map((g) => (
                <th key={g.id} scope="col">
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {otherCharges.map((row) => (
              <tr key={row.title} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink">
                  {row.title}
                </th>
                {otherColumns.map((g) => (
                  <td key={g.id} className="py-1.5 pl-2 text-right text-ink tabular-nums">
                    {!(g.id in row.rates)
                      ? "-"
                      : row.rates[g.id] === null
                        ? "Not published"
                        : formatINR(toPaise(row.rates[g.id] ?? 0))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Table 2 - when each meal is served, from Settings. */
export function CateringTimings({ rows }: { rows: { meal: string; time: string }[] }) {
  return (
    <section
      aria-labelledby="catering-heading"
      className="space-y-3 border border-border-strong bg-white p-4"
    >
      <h2 id="catering-heading" className="text-card font-semibold text-ink">
        Catering timings
      </h2>
      <table className="w-full text-sm">
        <caption className="sr-only">Meal serving times</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.meal} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-2 text-left font-medium text-ink">
                {row.meal}
              </th>
              <td className="py-2 text-right text-ink tabular-nums">{row.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The Guidelines: the office's Drive document when the manager has linked one, and the page. */
export function GuidelinesLinks({ documentUrl }: { documentUrl: string | null }) {
  return (
    <section
      aria-labelledby="guidelines-heading"
      className="space-y-3 border border-border-strong bg-white p-4"
    >
      <h2 id="guidelines-heading" className="text-card font-semibold text-ink">
        Guidelines
      </h2>
      <div className="flex flex-wrap gap-2">
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Guidelines document
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <Link
          href="/guidelines"
          className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-ink hover:bg-band"
        >
          Dos and don&apos;ts
        </Link>
      </div>
    </section>
  );
}

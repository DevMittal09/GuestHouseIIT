"use client";

import { describeDebit } from "@/lib/debit-heads";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { exportHistoryCsv } from "@/app/actions/history";
import { exportHistoryPdf } from "@/app/actions/history-pdf";
import { BookingDetails } from "@/components/booking-details";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { invoiceableFromArchive } from "@/lib/invoice";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BOOKING_SORT_KEYS,
  DATE_PRESET_GROUPS,
  DATE_PRESET_LABELS,
  SORT_LABELS,
  hasActiveFilters,
  latestReviewerActionOn,
  matchDatePreset,
  resolveDatePreset,
  type BookingSortKey,
  type HistoryActor,
  type HistoryParams,
} from "@/lib/booking-search";
import { formatDate, formatDateTime } from "@/lib/format";
import { toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { MEAL_KEYS, MEAL_LABELS } from "@/lib/meals";
import {
  REQUESTER_ROLES,
  ROLE_LABELS,
  STATUS_LABELS,
  type BookingStatus,
  type BookingWithDetails,
} from "@/lib/types";

const ALL_STATUSES = Object.keys(STATUS_LABELS) as BookingStatus[];
import { ACTIVE_STATUSES } from "@/lib/workflow";

interface Tile {
  key: string;
  label: string;
  statuses: BookingStatus[];
  tone: string;
}

/** Headline counts, which double as one-click status filters. */
const TILES: Tile[] = [
  { key: "all", label: "Total", statuses: [], tone: "text-foreground" },
  { key: "approved", label: "Approved", statuses: ["APPROVED", "OCCUPIED", "VACATED"], tone: "text-emerald-600 dark:text-emerald-400" },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"], tone: "text-red-600 dark:text-red-400" },
  { key: "pending", label: "In progress", statuses: ACTIVE_STATUSES, tone: "text-amber-600 dark:text-amber-400" },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED", "CANCELLATION_REQUESTED", "CANCELLATION_APPROVED"], tone: "text-muted-foreground" },
];

function sameStatusSet(a: BookingStatus[], b: BookingStatus[]): boolean {
  return a.length === b.length && a.every((s) => b.includes(s));
}

/** Serialise params back into a query string, dropping everything at default. */
function toQueryString(params: HistoryParams, defaultActor: HistoryActor): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.statuses.length) sp.set("status", params.statuses.join(","));
  if (params.meals.length) sp.set("meal", params.meals.join(","));
  if (params.guestHouseId) sp.set("gh", params.guestHouseId);
  if (params.userRole) sp.set("role", params.userRole);
  if (params.actor !== defaultActor) sp.set("actor", params.actor);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.sort !== "recent") sp.set("sort", params.sort);
  if (params.page > 1) sp.set("page", String(params.page));
  return sp.toString();
}

export function BookingHistory({
  rows,
  total,
  statusCounts,
  truncated,
  params,
  defaultActor,
  canFilterByRole,
  guestHouses,
  currentUserId,
  currentUserName,
  showAlumniCard,
  pageSize,
  isOwnBookings = false,
  canExportPdf: showPdfExport = false,
  canInvoice = false,
}: {
  rows: BookingWithDetails[];
  total: number;
  statusCounts: Record<BookingStatus, number>;
  truncated: boolean;
  params: HistoryParams;
  defaultActor: HistoryActor;
  canFilterByRole: boolean;
  guestHouses: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  showAlumniCard: boolean;
  pageSize: number;
  /** True for requester roles — hides the "Handled by me / Everything" toggle. */
  isOwnBookings?: boolean;
  /** True for gh_manager / developer — shows PDF export controls. */
  canExportPdf?: boolean;
  /**
   * True for the desk (manager, caretaker, developer): an Invoice button on
   * every stay that has checked out, however long ago, and on a dining
   * booking once approved — to issue, reprint or record payment (24 Sep 2026).
   */
  canInvoice?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isExporting, startExport] = useTransition();
  const [isPdfExporting, startPdfExport] = useTransition();

  // One timestamp for the whole mount, so every chip is compared against the
  // same "today" and the highlight cannot flicker mid-render.
  const [presetNow] = useState(() => new Date());
  const activePreset = matchDatePreset(params.from, params.to, presetNow);

  /** Navigate with a patched set of params. Any change resets to page 1. */
  const apply = (patch: Partial<HistoryParams>) => {
    const next: HistoryParams = { ...params, page: 1, ...patch };
    const qs = toQueryString(next, defaultActor);
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("q");
    apply({ q: typeof value === "string" ? value.trim() : "" });
  };

  const exportCsv = () =>
    startExport(async () => {
      const result = await exportHistoryCsv(toQueryString(params, defaultActor));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.rows === 0) {
        toast.error("Nothing to export for the current filters");
        return;
      }
      // Prefixed with a BOM so Excel reads the UTF-8 correctly.
      const blob = new Blob([`\ufeff${result.csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.rows} booking${result.rows === 1 ? "" : "s"}`);
    });

  const handlePdfExport = () =>
    startPdfExport(async () => {
      // Same query string the CSV export uses: whatever the filters currently
      // select. The date presets that used to live here only duplicated the
      // check-in range filter, and let the two disagree.
      const result = await exportHistoryPdf(toQueryString(params, defaultActor));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const count = result.report.rows.length;
      if (count === 0) {
        toast.error("No bookings match the current filters");
        return;
      }
      try {
        const { downloadHistoryPdf } = await import("@/lib/report-pdf");
        const stamp = toInstituteDateValue(new Date());
        await downloadHistoryPdf(result.report, `guest-house-report-${stamp}.pdf`);
        toast.success(`Downloaded ${count} booking${count === 1 ? "" : "s"} as PDF`);
      } catch (e) {
        console.error("PDF generation failed", e);
        toast.error("Could not generate the PDF");
      }
    });

  const filtersActive = hasActiveFilters(params, defaultActor);
  const grandTotal = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
  const firstRow = total === 0 ? 0 : (params.page - 1) * pageSize + 1;
  const lastRow = Math.min(params.page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      {/* Headline counts, also the status filter. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map((tile) => {
          const count =
            tile.statuses.length === 0
              ? grandTotal
              : tile.statuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0);
          const active = sameStatusSet(params.statuses, tile.statuses);
          return (
            <button
              key={tile.key}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ statuses: tile.statuses })}
              className={cn(
                "rounded-xl border bg-card px-4 py-3 text-left transition-colors",
                active
                  ? "border-primary ring-2 ring-primary/30"
                  : "hover:border-foreground/20 hover:bg-accent/40"
              )}
            >
              <span className="block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {tile.label}
              </span>
              <span className={cn("mt-1 block text-2xl font-semibold tabular-nums", tile.tone)}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + filters. */}
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input
            key={params.q}
            name="q"
            defaultValue={params.q}
            placeholder="Search reference, requester, guest, room, purpose…"
            aria-label="Search bookings"
            className="sm:flex-1"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              Search
            </Button>
            {filtersActive && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  apply({
                    q: "",
                    statuses: [],
                    meals: [],
                    guestHouseId: undefined,
                    userRole: undefined,
                    actor: defaultActor,
                    from: undefined,
                    to: undefined,
                    sort: "recent",
                  })
                }
              >
                Clear
              </Button>
            )}
          </div>
        </form>

        <p className="text-xs text-muted-foreground">
          Narrow a search with prefixes —{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">ref:</code> booking id,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">guest:</code> guest name,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">room:</code> allotted room,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">by:</code> requester,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">status:</code> stage. Wrap several
          words in quotes, e.g.{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">guest:&quot;Anita Rao&quot;</code>.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <Filter label="Stages">
            {/* Every stage starts ticked, because an empty list means "all".
                Drawn unticked it read as "nothing selected", which is the
                opposite of what the archive was actually showing. */}
            <CheckList
              options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              selected={params.statuses}
              onChange={(next) =>
                // All ticked is stored as "none", so the URL stays clean and
                // a stage added later is included rather than silently missed.
                apply({ statuses: next.length === ALL_STATUSES.length ? [] : next })
              }
            />
          </Filter>

          <Filter label="Meals">
            <CheckList
              options={MEAL_KEYS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
              selected={params.meals}
              onChange={(next) =>
                apply({ meals: next.length === MEAL_KEYS.length ? [] : next })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Keeps bookings that asked for any ticked meal on any day of the stay.
            </p>
          </Filter>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Handled by me / Everything — only for approver roles. */}
          {!isOwnBookings && (
            <Filter label="Show">
              <div className="flex h-9 rounded-md border p-0.5">
                {(["me", "all"] as HistoryActor[]).map((actor) => (
                  <button
                    key={actor}
                    type="button"
                    aria-pressed={params.actor === actor}
                    onClick={() => apply({ actor })}
                    className={cn(
                      "flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors",
                      params.actor === actor
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {actor === "me" ? "Handled by me" : "Everything in scope"}
                  </button>
                ))}
              </div>
            </Filter>
          )}

          <Filter label="Guest house">
            <NativeSelect
              value={params.guestHouseId ?? ""}
              onChange={(e) => apply({ guestHouseId: e.target.value || undefined })}
            >
              <option value="">All guest houses</option>
              {guestHouses.map((gh) => (
                <option key={gh.id} value={gh.id}>
                  {gh.name}
                </option>
              ))}
            </NativeSelect>
          </Filter>

          {canFilterByRole && (
            <Filter label="Requester category">
              <NativeSelect
                value={params.userRole ?? ""}
                onChange={(e) =>
                  apply({ userRole: (e.target.value || undefined) as HistoryParams["userRole"] })
                }
              >
                <option value="">All categories</option>
                {REQUESTER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </NativeSelect>
            </Filter>
          )}

          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <div className="flex items-center gap-3">
              <p className="text-xs font-medium text-muted-foreground">Check-in range</p>
              {(params.from || params.to) && (
                <button
                  type="button"
                  onClick={() => apply({ from: undefined, to: undefined })}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Clear · any date
                </button>
              )}
            </div>

            {/* Rolling windows and whole calendar periods are different
                questions — "last 30 days" is not "last month" — so they are
                grouped rather than mixed into one undifferentiated row. */}
            {DATE_PRESET_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
                  {group.label}
                </span>
                {group.presets.map((preset) => {
                  const active = activePreset === preset;
                  const range = resolveDatePreset(preset, presetNow);
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      title={`${formatDate(range.from)} — ${formatDate(range.to)}`}
                      onClick={() =>
                        // Clicking the lit chip clears it, so the row is also
                        // the way back to "any date".
                        apply(
                          active
                            ? { from: undefined, to: undefined }
                            : resolveDatePreset(preset)
                        )
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {DATE_PRESET_LABELS[preset]}
                    </button>
                  );
                })}
              </div>
            ))}

            <div className="grid gap-3 sm:grid-cols-2">
              <Filter label="From">
                <Input
                  type="date"
                  value={params.from ?? ""}
                  max={params.to}
                  onChange={(e) => apply({ from: e.target.value || undefined })}
                />
              </Filter>
              <Filter label="Until">
                <Input
                  type="date"
                  value={params.to ?? ""}
                  min={params.from}
                  onChange={(e) => apply({ to: e.target.value || undefined })}
                />
              </Filter>
            </div>
          </div>

          <Filter label="Sort by">
            <NativeSelect
              value={params.sort}
              onChange={(e) => apply({ sort: e.target.value as BookingSortKey })}
            >
              {BOOKING_SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </NativeSelect>
          </Filter>
        </div>
      </div>

      {truncated && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Only the most recent 1,000 bookings were scanned for this search. Add a date range or a
          guest house filter to be sure older records are included.
        </p>
      )}

      {/* Results. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "No matching bookings" : `Showing ${firstRow}–${lastRow} of ${total}`}
          {!isOwnBookings && params.actor === "me" && (
            <span> handled by {currentUserName.split(" ")[0]}</span>
          )}
        </p>
        {/* Both formats export exactly what the filters above have selected,
            so the only choice left here is the file type. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Export as</span>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={isExporting || isPdfExporting || total === 0}
          >
            {isExporting ? "Preparing…" : "CSV"}
          </Button>
          {showPdfExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePdfExport}
              disabled={isExporting || isPdfExporting || total === 0}
            >
              {isPdfExporting ? "Generating…" : "PDF"}
            </Button>
          )}
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          {isOwnBookings
            ? "You have not submitted any booking requests yet."
            : params.actor === "me"
              ? "You have not acted on any request matching these filters yet. Switch to \u201cEverything in scope\u201d to search the full archive."
              : "No bookings match these filters."}
        </p>
      ) : (
        <div
          className={cn(
            "overflow-x-auto rounded-lg border transition-opacity",
            isPending && "opacity-60"
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                {!isOwnBookings && <TableHead>Requester</TableHead>}
                <TableHead>Guest House</TableHead>
                <TableHead>Stay</TableHead>
                <TableHead>Status</TableHead>
                {!isOwnBookings && <TableHead>My decision</TableHead>}
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((booking) => (
                <HistoryRow
                  key={booking.id}
                  booking={booking}
                  currentUserId={currentUserId}
                  showAlumniCard={showAlumniCard}
                  isOwnBookings={isOwnBookings}
                  canInvoice={canInvoice}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={params.page <= 1 || isPending}
            onClick={() => apply({ page: params.page - 1 })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {params.page} of {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={params.page >= lastPage || isPending}
            onClick={() => apply({ page: params.page + 1 })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A row of tick boxes where **everything ticked is the default**.
 *
 * `selected` empty means "no filter", which is the same set of results as
 * every box ticked — so that is how it is drawn. Unticking one sends the
 * remaining boxes as an explicit list; ticking the last one back returns to
 * empty, and the URL loses the parameter again.
 */
function CheckList<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  const all = selected.length === 0;
  const isOn = (value: T) => all || selected.includes(value);
  const toggle = (value: T) => {
    const current = all ? options.map((o) => o.value) : selected;
    onChange(isOn(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={isOn(o.value)}
            onChange={() => toggle(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      {children}
    </div>
  );
}

const DECISION_CLASSES: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground",
  other: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  other: "Updated",
};

function HistoryRow({
  booking,
  currentUserId,
  showAlumniCard,
  isOwnBookings,
  canInvoice,
}: {
  booking: BookingWithDetails;
  currentUserId: string;
  showAlumniCard: boolean;
  isOwnBookings: boolean;
  canInvoice: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = latestReviewerActionOn(booking, currentUserId);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      {!isOwnBookings && (
        <TableCell>
          <span className="font-medium">{booking.requester?.full_name ?? "—"}</span>
          <span className="block text-xs text-muted-foreground">
          Head: {describeDebit(booking)}
        </span>
          <span className="block text-xs text-muted-foreground">
            {ROLE_LABELS[booking.user_role]}
            {booking.requester?.hostel_name && ` · ${booking.requester.hostel_name}`}
            {booking.requester?.department_or_club && ` · ${booking.requester.department_or_club}`}
          </span>
        </TableCell>
      )}
      <TableCell>{booking.guest_house?.name ?? "—"}</TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(booking.check_in)}
        <span className="block text-xs text-muted-foreground">
          to {formatDate(booking.check_out)}
        </span>
      </TableCell>
      <TableCell>
        <StatusBadge status={booking.status} />
      </TableCell>
      {!isOwnBookings && (
        <TableCell>
          {action ? (
            <>
              <Badge className={cn("whitespace-nowrap border-transparent", DECISION_CLASSES[action.kind])}>
                {DECISION_LABELS[action.kind]}
              </Badge>
              <span className="mt-1 block text-xs text-muted-foreground">
                {formatDateTime(action.log.timestamp)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      <TableCell className="text-right">
        {/* After check-out the stay leaves the desk's lists within a month;
            here it can still be invoiced, reprinted or marked paid. The
            dialog re-checks the role on the server. */}
        {canInvoice && invoiceableFromArchive(booking) && (
          <span className="mr-2 inline-block">
            <InvoiceDialog booking={booking} />
          </span>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              View
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{booking.booking_reference_id}</DialogTitle>
              <DialogDescription>
                {isOwnBookings
                  ? "Full details and approval trail for your booking request."
                  : "Read-only record, including the full approval trail. Status changes are made from the review queue."}
              </DialogDescription>
            </DialogHeader>
            <BookingDetails booking={booking} showAlumniCard={showAlumniCard} />
            {action?.log.remarks && !isOwnBookings && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Your remark</p>
                <p className="text-muted-foreground">{action.log.remarks}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { exportHistoryCsv } from "@/app/actions/history";
import { exportHistoryPdf } from "@/app/actions/history-pdf";
import { BookingDetails } from "@/components/booking-details";
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
  SORT_LABELS,
  hasActiveFilters,
  latestReviewerActionOn,
  type BookingSortKey,
  type HistoryActor,
  type HistoryParams,
} from "@/lib/booking-search";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  REQUESTER_ROLES,
  ROLE_LABELS,
  type BookingStatus,
  type BookingWithDetails,
} from "@/lib/types";
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
  if (params.guestHouseId) sp.set("gh", params.guestHouseId);
  if (params.userRole) sp.set("role", params.userRole);
  if (params.actor !== defaultActor) sp.set("actor", params.actor);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.sort !== "recent") sp.set("sort", params.sort);
  if (params.page > 1) sp.set("page", String(params.page));
  return sp.toString();
}

/** Quick-pick date range presets. */
function getDatePreset(
  key: "today" | "week" | "month"
): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      return { from: fmt(weekAgo), to: fmt(today) };
    }
    case "month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(monthStart), to: fmt(today) };
    }
  }
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
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isExporting, startExport] = useTransition();
  const [isPdfExporting, startPdfExport] = useTransition();

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

  const handlePdfExport = (preset?: "today" | "week" | "month") =>
    startPdfExport(async () => {
      // When a preset is clicked, first apply its dates to the current params
      // so the exported range matches. Otherwise use current filters.
      const effectiveParams = preset
        ? { ...params, ...getDatePreset(preset) }
        : params;
      const qs = toQueryString(effectiveParams, defaultActor);
      const result = await exportHistoryPdf(qs);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.rows === 0) {
        toast.error("No bookings found for the selected range");
        return;
      }
      // Decode the base64 HTML and open in a print window
      const html = atob(result.pdfBase64);
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        // Small delay to ensure styles load before print dialog
        setTimeout(() => {
          printWindow.print();
        }, 300);
        toast.success(`Report ready — ${result.rows} booking${result.rows === 1 ? "" : "s"}. Use "Save as PDF" in the print dialog.`);
      } else {
        // Popup blocked — fall back to download
        const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success(`Report downloaded — open the file and print to PDF.`);
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

          <Filter label="Check-in from">
            <Input
              type="date"
              value={params.from ?? ""}
              max={params.to}
              onChange={(e) => apply({ from: e.target.value || undefined })}
            />
          </Filter>

          <Filter label="Check-in until">
            <Input
              type="date"
              value={params.to ?? ""}
              min={params.from}
              onChange={(e) => apply({ to: e.target.value || undefined })}
            />
          </Filter>

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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExporting || total === 0}>
            {isExporting ? "Preparing…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* PDF Export panel — only for gh_manager and developer. */}
      {showPdfExport && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">PDF Report</p>
              <p className="text-xs text-muted-foreground">
                Generate a PDF report of the currently filtered logs, or use a quick date preset.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isPdfExporting}
              onClick={() => handlePdfExport("today")}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPdfExporting}
              onClick={() => handlePdfExport("week")}
            >
              Last 7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPdfExporting}
              onClick={() => handlePdfExport("month")}
            >
              This month
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isPdfExporting || total === 0}
              onClick={() => handlePdfExport()}
            >
              {isPdfExporting ? "Generating PDF…" : "Current filters"}
            </Button>
          </div>
        </div>
      )}

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
}: {
  booking: BookingWithDetails;
  currentUserId: string;
  showAlumniCard: boolean;
  isOwnBookings: boolean;
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

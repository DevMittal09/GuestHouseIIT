"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminDeleteBookingAction, adminSetBookingStatusAction } from "@/app/actions/admin";
import { BookingDetails } from "@/components/booking-details";
import { StatusBadge } from "@/components/status-badge";
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
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  type BookingStatus,
  type BookingWithDetails,
} from "@/lib/types";

const ALL_STATUSES = Object.keys(STATUS_LABELS) as BookingStatus[];

export function BookingsManager({ bookings }: { bookings: BookingWithDetails[] }) {
  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all");
  const visible =
    statusFilter === "all" ? bookings : bookings.filter((b) => b.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          All ({bookings.length})
        </FilterChip>
        {ALL_STATUSES.map((s) => {
          const count = bookings.filter((b) => b.status === s).length;
          if (count === 0) return null;
          return (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {STATUS_LABELS[s]} ({count})
            </FilterChip>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No bookings match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Guest House</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((b) => (
                <AdminBookingRow key={b.id} booking={b} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

function AdminBookingRow({ booking }: { booking: BookingWithDetails }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState<BookingStatus>(booking.status);
  const [remark, setRemark] = useState("");

  const applyOverride = () =>
    startTransition(async () => {
      const result = await adminSetBookingStatusAction(booking.id, overrideStatus, remark);
      if (result.ok) {
        toast.success(`Status set to ${STATUS_LABELS[overrideStatus]}`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const remove = () => {
    if (!window.confirm(`Permanently delete ${booking.booking_reference_id}?`)) return;
    startTransition(async () => {
      const result = await adminDeleteBookingAction(booking.id);
      if (result.ok) {
        toast.success("Booking deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>
        <span className="font-medium">{booking.requester.full_name}</span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>{ROLE_LABELS[booking.user_role]}</TableCell>
      <TableCell>{booking.guest_house.name}</TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>
        <StatusBadge status={booking.status} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Manage
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Manage {booking.booking_reference_id}</DialogTitle>
                <DialogDescription>
                  Developer override — force any status (audit-logged) or delete the booking.
                </DialogDescription>
              </DialogHeader>
              <BookingDetails booking={booking} showAlumniCard />
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">Force status</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>New status</Label>
                    <NativeSelect
                      value={overrideStatus}
                      onChange={(e) => setOverrideStatus(e.target.value as BookingStatus)}
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label>Remark (required)</Label>
                    <Input
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder="Why this override?"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={isPending || overrideStatus === booking.status || !remark.trim()}
                    onClick={applyOverride}
                  >
                    Apply override
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="destructive" size="sm" disabled={isPending} onClick={remove}>
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/section-heading";
import {
  addOnBehalfEntryAction,
  removeOnBehalfEntryAction,
} from "@/app/actions/on-behalf";
import type { OnBehalfEntry } from "@/lib/store/types";
import type { Profile } from "@/lib/types";
import { isNonTeachingStaff } from "@/lib/staff-booking";

export function OnBehalfSettings({
  entries,
  profiles,
}: {
  entries: OnBehalfEntry[];
  profiles: Profile[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<OnBehalfEntry | null>(null);

  const [targetId, setTargetId] = useState("");
  const [bookerId, setBookerId] = useState("");

  const byId = new Map(profiles.map((p) => [p.id, p]));

  const nonTeachingStaff = profiles.filter((p) => isNonTeachingStaff(p));

  const add = () =>
    startTransition(async () => {
      if (!targetId || !bookerId) {
        toast.error("Select both a target and a booker");
        return;
      }
      if (targetId === bookerId) {
        toast.error("The target and booker must be different accounts");
        return;
      }
      const existing = entries.find(
        (e) => e.target_profile_id === targetId && e.booker_profile_id === bookerId,
      );
      if (existing) {
        toast.error("This pair is already configured");
        return;
      }
      const result = await addOnBehalfEntryAction(targetId, bookerId);
      if (result.ok) {
        toast.success("Entry added");
        setTargetId("");
        setBookerId("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });

  const remove = (entry: OnBehalfEntry) =>
    startTransition(async () => {
      const result = await removeOnBehalfEntryAction(entry.id);
      if (result.ok) {
        toast.success("Entry removed");
        setRemoving(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Booking on Behalf of Non-Teaching Staff</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure which non-teaching staff may be booked on behalf of, and who is allowed to do it.
          On behalf of teaching staff (faculty), only official booking is allowed.
          On behalf of non-teaching staff, only personal booking is allowed.
        </p>
      </div>

      {/* Add form */}
      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="text-sm font-medium">Add a new pair</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="on-behalf-target" className="text-sm font-medium">
              Book on behalf of (non-teaching staff)
            </label>
            <ProfileSelect
              id="on-behalf-target"
              profiles={nonTeachingStaff}
              value={targetId}
              onChange={setTargetId}
              placeholder="Search non-teaching staff"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="on-behalf-booker" className="text-sm font-medium">
              Who may book for them
            </label>
            <ProfileSelect
              id="on-behalf-booker"
              profiles={profiles}
              value={bookerId}
              onChange={setBookerId}
              placeholder="Search by name or email"
            />
          </div>
        </div>
        <Button onClick={add} disabled={isPending || !targetId || !bookerId} size="sm">
          Add
        </Button>
      </div>

      {/* Current entries */}
      {entries.length === 0 ? (
        <EmptyState>No on-behalf pairs configured yet</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Book on behalf of</TableHead>
              <TableHead>Booker</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const target = byId.get(entry.target_profile_id);
              const booker = byId.get(entry.booker_profile_id);
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <span className="font-medium">{target?.full_name ?? "Unknown"}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {target?.email ?? entry.target_profile_id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{booker?.full_name ?? "Unknown"}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {booker?.email ?? entry.booker_profile_id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemoving(entry)}
                      disabled={isPending}
                      title="Remove"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove on-behalf pair"
        description={
          removing
            ? `Remove ${byId.get(removing.booker_profile_id)?.full_name ?? "this booker"} from booking on behalf of ${byId.get(removing.target_profile_id)?.full_name ?? "this person"}?`
            : ""
        }
        onConfirm={() => removing && remove(removing)}
        pending={isPending}
        confirmLabel="Remove"
      />
    </section>
  );
}

function ProfileSelect({
  id,
  profiles,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  profiles: Profile[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? profiles.find((p) => p.id === value) : null;

  const filtered = query.trim()
    ? profiles.filter((p) => {
        const q = query.toLowerCase();
        return p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
      })
    : [];

  const select = (profileId: string) => {
    onChange(profileId);
    setQuery("");
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setQuery("");
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded border bg-background px-3 py-2 text-sm">
        <span className="flex-1 truncate">
          {selected.full_name} ({selected.email})
        </span>
        <button
          type="button"
          onClick={clear}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Clear selection"
        >
          &times;
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <input
          id={id}
          type="text"
          className="w-full rounded border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border bg-popover shadow-md">
          {filtered.slice(0, 20).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(p.id)}
              >
                <span className="font-medium">{p.full_name}</span>
                <span className="ml-2 text-muted-foreground">{p.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

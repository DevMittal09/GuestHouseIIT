"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createUnitAction, deleteUnitAction, updateUnitAction } from "@/app/actions/units";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  approversOf,
  UNIT_HEAD_TITLES,
  UNIT_KIND_LABELS,
  type Unit,
  type UnitKind,
} from "@/lib/units";
import type { Profile } from "@/lib/types";

/**
 * Departments, clubs, councils and offices, and who approves for each.
 *
 * Built for the change that happens every two years: a new HOD or a new
 * council secretary is one select on one row, and every request waiting on
 * that unit moves to them at once.
 */
export function UnitsManager({ units, profiles }: { units: Unit[]; profiles: Profile[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<UnitKind>("department");
  const [parentId, setParentId] = useState("");

  const people = [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const members = (unitId: string) => profiles.filter((p) => p.unit_id === unitId).length;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });

  const add = () =>
    run(async () => {
      const result = await createUnitAction({ name, kind, parent_id: parentId });
      if (result.ok) {
        setName("");
        setParentId("");
      }
      return result;
    }, `${name} added`);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Departments &amp; Clubs</h2>
        <p className="text-sm text-muted-foreground">
          Who approves for each department, club, council and office. When an HOD or a secretary
          changes, change it here — requests already waiting move to the new person on their own.
          A club with no head of its own is approved by the head of the council above it.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4 sm:items-end">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="unit-name">Name</Label>
          <Input
            id="unit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mechanical Engineering, Cultural Council"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit-kind">Kind</Label>
          <NativeSelect
            id="unit-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as UnitKind)}
          >
            {(Object.keys(UNIT_KIND_LABELS) as UnitKind[]).map((k) => (
              <option key={k} value={k}>
                {UNIT_KIND_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit-parent">Sits under</Label>
          <NativeSelect
            id="unit-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">Nothing</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="sm:col-span-4 flex justify-end">
          <Button onClick={add} disabled={isPending || name.trim().length < 2}>
            Add
          </Button>
        </div>
      </div>

      {units.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nothing here yet. Add the departments first, then the councils, then the clubs under
          them.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Sits under</TableHead>
                <TableHead>Head</TableHead>
                <TableHead>Acting head</TableHead>
                <TableHead>Approved by</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => {
                const approvers = approversOf(u.id, units).map((id) => byId.get(id)?.full_name ?? id);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="font-medium">{u.name}</span>
                      <Badge variant="outline" className="ml-2 align-middle">
                        {UNIT_KIND_LABELS[u.kind]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`Parent of ${u.name}`}
                        value={u.parent_id ?? ""}
                        disabled={isPending}
                        onChange={(e) =>
                          run(
                            () => updateUnitAction(u.id, { parent_id: e.target.value }),
                            `${u.name} moved`
                          )
                        }
                      >
                        <option value="">Nothing</option>
                        {units
                          .filter((other) => other.id !== u.id)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name}
                            </option>
                          ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      <PersonSelect
                        label={`${UNIT_HEAD_TITLES[u.kind]} of ${u.name}`}
                        value={u.head_id}
                        people={people}
                        disabled={isPending}
                        onChange={(id) =>
                          run(
                            () => updateUnitAction(u.id, { head_id: id }),
                            `${UNIT_HEAD_TITLES[u.kind]} of ${u.name} updated`
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <PersonSelect
                        label={`Acting head of ${u.name}`}
                        value={u.acting_head_id}
                        people={people}
                        disabled={isPending}
                        onChange={(id) =>
                          run(
                            () => updateUnitAction(u.id, { acting_head_id: id }),
                            `Acting head of ${u.name} updated`
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {approvers.length > 0 ? (
                        approvers.join(", ")
                      ) : (
                        // Nobody anywhere up the chain: requests from here go
                        // straight to the manager, and it is worth knowing.
                        <span className="text-amber-700 dark:text-amber-400">
                          Nobody — requests go straight to the manager
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{members(u.id)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => run(() => deleteUnitAction(u.id), `${u.name} removed`)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function PersonSelect({
  label,
  value,
  people,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  people: Profile[];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">None</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name} — {p.email}
        </option>
      ))}
    </NativeSelect>
  );
}

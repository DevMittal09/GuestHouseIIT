"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createUnitAction, deleteUnitAction, updateUnitAction } from "@/app/actions/units";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  hodApproversFor,
  hodUnitIdFor,
  OFFICE_CLASS_LABELS,
  UNIT_HEAD_TITLES,
  UNIT_KIND_LABELS,
  type OfficeClass,
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
  const [officeClass, setOfficeClass] = useState<OfficeClass>("department");
  const [deleting, setDeleting] = useState<Unit | null>(null);

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
      const result = await createUnitAction({
        name,
        kind,
        parent_id: parentId,
        office_class: kind === "office" ? officeClass : null,
      });
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
        {kind === "office" && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="unit-office-class">Kind of office</Label>
            <NativeSelect
              id="unit-office-class"
              value={officeClass}
              onChange={(e) => setOfficeClass(e.target.value as OfficeClass)}
            >
              {(Object.keys(OFFICE_CLASS_LABELS) as OfficeClass[]).map((c) => (
                <option key={c} value={c}>
                  {OFFICE_CLASS_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
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
                <TableHead>Office class</TableHead>
                <TableHead>Sits under</TableHead>
                <TableHead>Head</TableHead>
                <TableHead>Acting head</TableHead>
                <TableHead>Approved by</TableHead>
                <TableHead>HOD approval by</TableHead>
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
                      {u.kind === "office" ? (
                        <NativeSelect
                          aria-label={`Kind of office: ${u.name}`}
                          value={u.office_class ?? ""}
                          disabled={isPending}
                          onChange={(e) =>
                            run(
                              () =>
                                updateUnitAction(u.id, {
                                  office_class: (e.target.value || null) as OfficeClass | null,
                                }),
                              `${u.name} updated`
                            )
                          }
                        >
                          <option value="">Not set (treated as a department office)</option>
                          {(Object.keys(OFFICE_CLASS_LABELS) as OfficeClass[]).map((c) => (
                            <option key={c} value={c}>
                              {OFFICE_CLASS_LABELS[c]}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                    <TableCell>
                      <NativeSelect
                        aria-label={`HOD approval for ${u.name}`}
                        value={u.hod_unit_id ?? ""}
                        disabled={isPending}
                        onChange={(e) =>
                          run(
                            () => updateUnitAction(u.id, { hod_unit_id: e.target.value }),
                            `HOD approval for ${u.name} updated`
                          )
                        }
                      >
                        <option value="">
                          {defaultHodLabel(u, units, byId)}
                        </option>
                        {units
                          .filter((other) => other.id !== u.id && (other.kind === "department" || other.kind === "office"))
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name}
                            </option>
                          ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="text-right">{members(u.id)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => setDeleting(u)}
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
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this unit?"
        description={`${deleting?.name ?? ""} will be removed. Its requests will no longer be routed to its head. A unit that still has members or sub-units cannot be deleted — move them first.`}
        confirmPhrase={deleting?.name}
        pending={isPending}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          run(async () => {
            const result = await deleteUnitAction(target.id);
            if (result.ok) setDeleting(null);
            return result;
          }, `${target.name} removed`);
        }}
      />
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

/**
 * What "Default" means for a unit's HOD approval, so the option names who it
 * actually resolves to rather than leaving the office to guess.
 */
function defaultHodLabel(unit: Unit, units: Unit[], byId: Map<string, Profile>): string {
  const withDefault = units.map((x) => (x.id === unit.id ? { ...x, hod_unit_id: null } : x));
  const target = hodUnitIdFor(unit.id, withDefault);
  if (!target) return "Default — no HOD stage";
  const names = hodApproversFor({ id: "", unit_id: unit.id }, withDefault).map(
    (id) => byId.get(id)?.full_name ?? id
  );
  const where = units.find((x) => x.id === target)?.name ?? "?";
  return `Default — ${where}${names.length > 0 ? ` (${names.join(", ")})` : ", nobody set"}`;
}

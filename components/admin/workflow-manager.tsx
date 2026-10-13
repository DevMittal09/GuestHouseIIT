"use client";

import { useMemo, useState } from "react";
import {
  previewApprovalRoute,
  resetApprovalRoutes,
  saveApprovalRoutes,
  type RoutePreview,
  type WorkflowConsoleData,
} from "@/app/actions/workflow";
import { useRunner } from "@/components/admin/settings-manager";
import { WorkflowFlow } from "@/components/admin/workflow-flow";
import { EmptyState, SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  APPROVER_KIND_LABELS,
  APPROVER_KINDS,
  BUILT_IN_STAGE_APPROVERS,
  describeChain,
  describeConditions,
  describeRouteChanges,
  STAGE_STATUSES,
  stageLabel,
  type ApprovalRouteRule,
  type ApprovalRules,
  type ApprovalStage,
  type ApproverKind,
  type ApproverRule,
  type NamedDirectory,
  type StageStatus,
} from "@/lib/approval-routes";
import {
  BOOKING_TYPE_LABELS,
  ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  STAFF_CATEGORY_LABELS,
  STATUS_LABELS,
  type BookingType,
  type Role,
  type ServiceType,
  type StaffCategory,
} from "@/lib/types";

/**
 * Console -> **Approval Workflow**: who forwards whose request.
 *
 * One ordered list of routes. A request takes the **first active route that
 * matches it**, and the office can insert a route, delete one, move it up or
 * down, turn it off without losing it, and change the stages inside it - what
 * each stage is called, and who decides it.
 *
 * Two things hold the section together, and both are deliberate:
 *
 * - **Order is visible and editable**, because order is the rule. A narrow
 *   route below a broad one never fires, and nothing else on the page would
 *   tell you so.
 * - **"Try it" names real people.** A chain of conditions is hard to read
 *   back; "Dr Arun Prasad, then the Guest House Manager" is not. The preview
 *   runs the routes being edited, not the saved ones, so it answers the
 *   question the office actually has before they press Save.
 *
 * Nothing is saved rule by rule: the whole list goes at once, behind a
 * confirmation that lists the changes, and the server refuses a workflow that
 * would leave a request already waiting with nobody to decide it.
 */
export function WorkflowManager({ data }: { data: WorkflowConsoleData }) {
  const { isPending, run } = useRunner();
  const [draft, setDraft] = useState<ApprovalRules>(data.rules);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // Only names are needed to describe a route, so the editor hands the
  // description helpers the trimmed rows it already has rather than
  // fabricating whole `Unit` and `Profile` objects.
  const directory: NamedDirectory = useMemo(
    () => ({
      units: data.units,
      profiles: data.people.map((p) => ({ id: p.id, full_name: p.name })),
    }),
    [data.units, data.people]
  );
  // In words, not as a JSON diff: inserting one stage produced a dozen lines
  // of `stages.1.approver.kind` that nobody could read, and a dialog taller
  // than the screen.
  const changes = describeRouteChanges(data.rules, draft, directory);
  const isDefault = JSON.stringify(data.rules) === JSON.stringify(data.defaults);

  const update = (id: string, next: ApprovalRouteRule) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? next : r)) }));

  const move = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      const rules = [...d.rules];
      const to = index + by;
      if (to < 0 || to >= rules.length) return d;
      [rules[index], rules[to]] = [rules[to], rules[index]];
      return { ...d, rules };
    });

  const remove = (id: string) =>
    setDraft((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));

  const insert = () => {
    const id = `route-${Date.now().toString(36)}`;
    setDraft((d) => ({
      ...d,
      // New routes go at the **top**: a route added below the broad default
      // that already matches everything would never fire, and "I added it and
      // nothing happened" is the one failure this section must not have.
      rules: [
        {
          id,
          name: "New route",
          active: true,
          when: {},
          stages: [],
        },
        ...d.rules,
      ],
    }));
    setEditing(id);
  };

  return (
    <section className="space-y-8">
      <div className="max-w-[80ch] space-y-2">
        <h2 className="text-section font-semibold text-ink">Approval workflow</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Who forwards whose request, and in what order.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A step nobody is set to decide is skipped, and the booking&apos;s log says so.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A change that would leave a waiting request with nobody to decide it is refused.
        </p>
      </div>

      <WorkflowFlow
        rules={draft}
        data={data}
        directory={directory}
        onChange={setDraft}
        disabled={isPending}
      />

      <TryItPanel data={data} draft={draft} />

      {/* The engine's own shape, for the condition a chain cannot express -
          "every request from Civil also goes to the Dean". Shut by default:
          order and conditions are not questions the office has to answer to
          run the chain above. */}
      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Advanced: every route in order ({draft.rules.length})
        </summary>
        <div className="mt-5">
          <SectionHeading
            title="Routes"
            count={draft.rules.length}
            description="In order. The first active route that matches a request decides where it goes."
            action={
              <Button size="sm" variant="outline" onClick={insert} disabled={isPending}>
                Add a route
              </Button>
            }
          />
          {draft.rules.length === 0 ? (
            <EmptyState>
              No routes. Every request would go straight to the Guest House Manager.
            </EmptyState>
          ) : (
            <ol className="divide-y divide-border border-y border-border">
              {draft.rules.map((rule, index) => (
                <li key={rule.id} className="py-4">
                  <RouteRow
                    rule={rule}
                    index={index}
                    total={draft.rules.length}
                    data={data}
                    directory={directory}
                    open={editing === rule.id}
                    onToggle={() => setEditing(editing === rule.id ? null : rule.id)}
                    onChange={(next) => update(rule.id, next)}
                    onMove={(by) => move(index, by)}
                    onRemove={() => remove(rule.id)}
                    disabled={isPending}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>


      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-strong pt-4">
        <p className="text-sm text-muted-foreground">
          {changes.length === 0
            ? "No unsaved changes."
            : `${changes.length} change${changes.length === 1 ? "" : "s"} not saved yet.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || changes.length === 0}
            onClick={() => setDraft(data.rules)}
          >
            Undo edits
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || isDefault}
            onClick={() => setResetting(true)}
          >
            Restore the institute&apos;s routes
          </Button>
          <Button size="sm" disabled={isPending || changes.length === 0} onClick={() => setConfirming(true)}>
            Save the workflow
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Change the approval workflow?"
        description="It applies from now on, to every new request. Requests already waiting keep the stage they are in; the server refuses the change if any of them would be left with nobody to decide it."
        consequences={changes}
        confirmLabel="Save the workflow"
        pending={isPending}
        onConfirm={() =>
          run(() => saveApprovalRoutes(draft), "Approval workflow saved", () => setConfirming(false))
        }
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Restore the institute's routes?"
        description="Every route goes back to the pipeline the portal was built with: student to Assistant Warden, faculty official to their HOD, an office direct or through its HOD, the Student Cell through the IAR Office, dining straight to the desk."
        consequences={["Every route you have added or edited is discarded"]}
        confirmLabel="Restore them"
        pending={isPending}
        onConfirm={() =>
          run(
            async () => {
              const result = await resetApprovalRoutes();
              if (result.ok) setDraft(data.defaults);
              return result;
            },
            "Restored the institute's routes",
            () => setResetting(false)
          )
        }
      />
    </section>
  );
}

// ------------------------------------------------------------------ a route

function RouteRow({
  rule,
  index,
  total,
  data,
  directory,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
  disabled,
}: {
  rule: ApprovalRouteRule;
  index: number;
  total: number;
  data: WorkflowConsoleData;
  directory: NamedDirectory;
  open: boolean;
  onToggle: () => void;
  onChange: (next: ApprovalRouteRule) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const conditions = describeConditions(rule, directory);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span className="figure-serif w-6 shrink-0 text-right text-[1.125rem] text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-[18ch] flex-1 space-y-1">
          <p className="text-card font-semibold text-ink">
            {rule.name}
            {!rule.active && (
              <span className="ml-2 text-meta font-normal text-muted-foreground">Off</span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {conditions.length > 0
              ? conditions.join(" · ")
              : "Every request not matched by a route above"}
          </p>
          <p className="text-sm text-ink">{describeChain(rule.stages, directory)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${rule.name} up`}
          >
            Up
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || index === total - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${rule.name} down`}
          >
            Down
          </Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={onToggle}>
            {open ? "Close" : "Edit"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Delete ${rule.name}`}
          >
            Delete
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-l-2 border-vermilion/40 pl-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`name-${rule.id}`}>Name</Label>
              <Input
                id={`name-${rule.id}`}
                value={rule.name}
                maxLength={90}
                onChange={(e) => onChange({ ...rule, name: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-ink"
                checked={rule.active}
                onChange={(e) => onChange({ ...rule, active: e.target.checked })}
              />
              In use
            </label>
          </div>

          <Conditions rule={rule} data={data} onChange={onChange} />
          <Stages rule={rule} data={data} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- conditions

function Conditions({
  rule,
  data,
  onChange,
}: {
  rule: ApprovalRouteRule;
  data: WorkflowConsoleData;
  onChange: (next: ApprovalRouteRule) => void;
}) {
  const set = <K extends keyof ApprovalRouteRule["when"]>(
    key: K,
    value: ApprovalRouteRule["when"][K]
  ) => {
    const when = { ...rule.when, [key]: value };
    if (Array.isArray(value) && value.length === 0) delete when[key];
    if (value == null) delete when[key];
    onChange({ ...rule, when });
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-meta font-semibold tracking-wide text-muted-foreground uppercase">
        Matches
      </legend>
      <p className="text-sm text-muted-foreground">
        Tick nothing in a row and it matches anything.
      </p>
      <CheckRow
        label="Requester"
        options={data.requesterRoles.map((r) => ({
          value: r,
          label: ROLE_LABELS[r as Role] ?? r,
        }))}
        selected={rule.when.roles ?? []}
        onChange={(v) => set("roles", v as Role[])}
      />
      <CheckRow
        label="Booking type"
        options={(["official", "personal", "alumni"] as BookingType[]).map((t) => ({
          value: t,
          label: BOOKING_TYPE_LABELS[t],
        }))}
        selected={rule.when.booking_types ?? []}
        onChange={(v) => set("booking_types", v as BookingType[])}
      />
      <CheckRow
        label="What is booked"
        options={(["room", "room_meals", "meals_only"] as ServiceType[]).map((t) => ({
          value: t,
          label: SERVICE_TYPE_LABELS[t],
        }))}
        selected={rule.when.service_types ?? []}
        onChange={(v) => set("service_types", v as ServiceType[])}
      />
      <CheckRow
        label="Employee category"
        options={(["faculty", "staff"] as StaffCategory[]).map((c) => ({
          value: c,
          label: STAFF_CATEGORY_LABELS[c],
        }))}
        selected={rule.when.staff_categories ?? []}
        onChange={(v) => set("staff_categories", v as StaffCategory[])}
      />
      <CheckRow
        label="Office's own choice"
        options={[
          { value: "direct", label: "Direct" },
          { value: "hod", label: "Requires HOD approval" },
        ]}
        selected={rule.when.office_approval ?? []}
        onChange={(v) => set("office_approval", v as ("direct" | "hod")[])}
      />
      {data.units.length > 0 && (
        <CheckRow
          label="Requester's unit"
          options={data.units.map((u) => ({ value: u.id, label: u.name }))}
          selected={rule.when.unit_ids ?? []}
          onChange={(v) => set("unit_ids", v)}
        />
      )}
      {data.hostels.length > 0 && (
        <CheckRow
          label="Requester's hostel"
          options={data.hostels.map((h) => ({ value: h, label: h }))}
          selected={rule.when.hostels ?? []}
          onChange={(v) => set("hostels", v)}
        />
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`advisor-${rule.id}`}>Raised by the club&apos;s Faculty Advisor</Label>
        <NativeSelect
          id={`advisor-${rule.id}`}
          className="max-w-[28ch]"
          value={rule.when.raised_by_advisor == null ? "" : rule.when.raised_by_advisor ? "yes" : "no"}
          onChange={(e) =>
            set("raised_by_advisor", e.target.value === "" ? null : e.target.value === "yes")
          }
        >
          <option value="">Either</option>
          <option value="yes">Yes</option>
          <option value="no">No - the account raised it itself</option>
        </NativeSelect>
      </div>
    </fieldset>
  );
}

function CheckRow({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14ch_1fr] sm:gap-4">
      <span className="pt-0.5 text-sm font-medium text-ink">{label}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-ink"
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stages

function Stages({
  rule,
  data,
  onChange,
}: {
  rule: ApprovalRouteRule;
  data: WorkflowConsoleData;
  onChange: (next: ApprovalRouteRule) => void;
}) {
  const used = new Set(rule.stages.map((s) => s.status));
  const free = STAGE_STATUSES.filter((s) => !used.has(s));

  const setStages = (stages: ApprovalStage[]) => onChange({ ...rule, stages });
  const addStage = () => {
    const status = free[0];
    if (!status) return;
    setStages([...rule.stages, { status, approver: BUILT_IN_STAGE_APPROVERS[status] }]);
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-meta font-semibold tracking-wide text-muted-foreground uppercase">
        Stages, in order
      </legend>
      {rule.stages.length === 0 ? (
        <EmptyState>Straight to the Guest House Manager.</EmptyState>
      ) : (
        <ol className="space-y-3">
          {rule.stages.map((stage, i) => (
            <li key={`${stage.status}-${i}`} className="space-y-2 border-l border-border pl-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`status-${rule.id}-${i}`}>Waits in</Label>
                  <NativeSelect
                    id={`status-${rule.id}-${i}`}
                    value={stage.status}
                    onChange={(e) => {
                      const status = e.target.value as StageStatus;
                      setStages(
                        rule.stages.map((s, j) => (j === i ? { ...s, status } : s))
                      );
                    }}
                  >
                    {[stage.status, ...free].map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`kind-${rule.id}-${i}`}>Decided by</Label>
                  <NativeSelect
                    id={`kind-${rule.id}-${i}`}
                    value={stage.approver.kind}
                    onChange={(e) =>
                      setStages(
                        rule.stages.map((s, j) =>
                          j === i
                            ? { ...s, approver: blankApprover(e.target.value as ApproverKind, data) }
                            : s
                        )
                      )
                    }
                  >
                    {APPROVER_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {APPROVER_KIND_LABELS[k]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <ApproverTarget
                stage={stage}
                data={data}
                onChange={(approver) =>
                  setStages(rule.stages.map((s, j) => (j === i ? { ...s, approver } : s)))
                }
                idPrefix={`${rule.id}-${i}`}
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor={`label-${rule.id}-${i}`}>
                    Call this stage (optional)
                  </Label>
                  <Input
                    id={`label-${rule.id}-${i}`}
                    value={stage.label ?? ""}
                    maxLength={60}
                    placeholder={STATUS_LABELS[stage.status]}
                    onChange={(e) =>
                      setStages(
                        rule.stages.map((s, j) =>
                          j === i ? { ...s, label: e.target.value || null } : s
                        )
                      )
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pb-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={i === 0}
                    onClick={() => {
                      const stages = [...rule.stages];
                      [stages[i - 1], stages[i]] = [stages[i], stages[i - 1]];
                      setStages(stages);
                    }}
                    aria-label={`Move ${stageLabel(stage)} earlier`}
                  >
                    Earlier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={i === rule.stages.length - 1}
                    onClick={() => {
                      const stages = [...rule.stages];
                      [stages[i], stages[i + 1]] = [stages[i + 1], stages[i]];
                      setStages(stages);
                    }}
                    aria-label={`Move ${stageLabel(stage)} later`}
                  >
                    Later
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStages(rule.stages.filter((_, j) => j !== i))}
                    aria-label={`Remove ${stageLabel(stage)}`}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button variant="outline" size="sm" onClick={addStage} disabled={free.length === 0}>
        {free.length === 0 ? "All four stages are in use" : "Add a stage"}
      </Button>
    </fieldset>
  );
}

function blankApprover(kind: ApproverKind, data: WorkflowConsoleData): ApproverRule {
  switch (kind) {
    case "role":
      return { kind: "role", role: "warden" as Role };
    case "unit":
      return { kind: "unit", unit_id: data.units[0]?.id ?? "" };
    case "profile":
      return { kind: "profile", profile_id: data.people[0]?.id ?? "" };
    default:
      return { kind };
  }
}

function ApproverTarget({
  stage,
  data,
  onChange,
  idPrefix,
}: {
  stage: ApprovalStage;
  data: WorkflowConsoleData;
  onChange: (approver: ApproverRule) => void;
  idPrefix: string;
}) {
  const { approver } = stage;
  if (approver.kind === "role") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`role-${idPrefix}`}>Which role</Label>
        <NativeSelect
          id={`role-${idPrefix}`}
          className="max-w-[40ch]"
          value={approver.role}
          onChange={(e) => onChange({ kind: "role", role: e.target.value as Role })}
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </div>
    );
  }
  if (approver.kind === "unit") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`unit-${idPrefix}`}>Which unit</Label>
        <NativeSelect
          id={`unit-${idPrefix}`}
          className="max-w-[40ch]"
          value={approver.unit_id}
          onChange={(e) => onChange({ kind: "unit", unit_id: e.target.value })}
        >
          {data.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.hasHead ? "" : " (nobody heads it)"}
            </option>
          ))}
        </NativeSelect>
      </div>
    );
  }
  if (approver.kind === "profile") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`person-${idPrefix}`}>Who</Label>
        <NativeSelect
          id={`person-${idPrefix}`}
          className="max-w-[48ch]"
          value={approver.profile_id}
          onChange={(e) => onChange({ kind: "profile", profile_id: e.target.value })}
        >
          {data.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} - {p.email}
            </option>
          ))}
        </NativeSelect>
      </div>
    );
  }
  return null;
}

// ------------------------------------------------------------------ try it

function TryItPanel({ data, draft }: { data: WorkflowConsoleData; draft: ApprovalRules }) {
  const { isPending, run } = useRunner();
  const [who, setWho] = useState(data.people[0]?.id ?? "");
  const [bookingType, setBookingType] = useState<BookingType>("official");
  const [service, setService] = useState<ServiceType>("room");
  const [officeApproval, setOfficeApproval] = useState<"direct" | "hod">("direct");
  const [preview, setPreview] = useState<RoutePreview | null>(null);

  const tryIt = () =>
    run(async () => {
      const result = await previewApprovalRoute(draft, who, bookingType, service, officeApproval);
      if (!result.ok) {
        setPreview(null);
        return result;
      }
      setPreview(result.data);
      return { ok: true };
    }, "Route worked out");

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Try it"
        description="Where a request from one account would go under the routes above, before you save them."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="try-who">Requester</Label>
          <NativeSelect id="try-who" value={who} onChange={(e) => setWho(e.target.value)}>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({ROLE_LABELS[p.role as Role] ?? p.role})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="try-type">Booking type</Label>
          <NativeSelect
            id="try-type"
            value={bookingType}
            onChange={(e) => setBookingType(e.target.value as BookingType)}
          >
            {(["official", "personal", "alumni"] as BookingType[]).map((t) => (
              <option key={t} value={t}>
                {BOOKING_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="try-service">What is booked</Label>
          <NativeSelect
            id="try-service"
            value={service}
            onChange={(e) => setService(e.target.value as ServiceType)}
          >
            {(["room", "room_meals", "meals_only"] as ServiceType[]).map((t) => (
              <option key={t} value={t}>
                {SERVICE_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="try-office">If an office, its choice</Label>
          <NativeSelect
            id="try-office"
            value={officeApproval}
            onChange={(e) => setOfficeApproval(e.target.value as "direct" | "hod")}
          >
            <option value="direct">Direct</option>
            <option value="hod">Requires HOD approval</option>
          </NativeSelect>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={tryIt} disabled={isPending || !who}>
        Work out the route
      </Button>
      {preview && (
        <div className="space-y-3 border-l-2 border-ink pl-4">
          <p className="text-card font-semibold text-ink">{preview.chain}</p>
          <p className="text-sm text-muted-foreground">
            {preview.matched ? `Route: ${preview.matched}` : "No route matches, so it goes straight to the desk"}
          </p>
          {preview.stages.length > 0 && (
            <ol className="space-y-1 text-sm">
              {preview.stages.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-ink">{s.label}</span>
                  {" - "}
                  <span className={s.who.length === 0 ? "text-vermilion-deep" : "text-muted-foreground"}>
                    {s.who.length > 0 ? s.who.join(", ") : "nobody is set to decide this"}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {preview.skipped.length > 0 && (
            <p className="text-sm text-vermilion-deep">
              Skipped for want of an approver: {preview.skipped.join(", ")}
            </p>
          )}
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {STAGE_STATUSES.map((status) => (
          <div key={status} className="flex items-baseline justify-between gap-3 border-b border-border py-1">
            <dt className="text-muted-foreground">{STATUS_LABELS[status]}</dt>
            <dd className="figure-serif text-ink">{data.waiting[status] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

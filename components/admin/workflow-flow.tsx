"use client";

import { useState } from "react";
import type { WorkflowConsoleData } from "@/app/actions/workflow";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  approverFromValue,
  approverValue,
  categoryChains,
  freeSlots,
  insertStage,
  MAX_STEPS,
  moveStage,
  removeStage,
  setCategoryStages,
  setStageApprover,
  setStageLabel,
  uncoveredRules,
  type CategoryChain,
} from "@/lib/approval-categories";
import {
  describeApprover,
  type ApprovalRules,
  type ApprovalStage,
  type NamedDirectory,
} from "@/lib/approval-routes";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * **The approval workflow as a picture**: one chain per kind of request, read
 * left to right, ending at the desk.
 *
 * This is the screen the office works from. It is built on
 * `lib/approval-categories.ts`, which runs the real engine to say what each
 * kind of request does now, so nothing here decides anything - it shows and
 * it edits.
 *
 * What it deliberately does **not** show, because none of it is a question
 * the office can answer: the order of the routes, the conditions that match
 * them, which of the four waiting statuses a step occupies, and the six kinds
 * of approver. Precedence is handled by forking a route when one is shared
 * (see `setCategoryStages`); the slot is chosen by `slotForApprover`; and the
 * six kinds are one grouped select, "who decides this step".
 *
 * The ordered list of routes is still there, under Advanced, for the office
 * that wants to write a condition by hand.
 */
export function WorkflowFlow({
  rules,
  data,
  directory,
  onChange,
  disabled,
}: {
  rules: ApprovalRules;
  data: WorkflowConsoleData;
  directory: NamedDirectory;
  onChange: (next: ApprovalRules) => void;
  disabled: boolean;
}) {
  // Keyed by the status rather than the position, so reordering the steps
  // does not open a different one.
  const [open, setOpen] = useState<string | null>(null);
  const chains = categoryChains(rules);
  // A route no card governs is still in force, so it is named rather than
  // left to be discovered under Advanced.
  const others = uncoveredRules(rules).filter((rule) => rule.active);

  return (
    <div>
      <SectionHeading
        title="How each kind of request is approved"
        description="Read left to right. Click a step to change who decides it."
      />
      <ol
        aria-label="Approval chains by kind of request"
        className="divide-y divide-border border-y border-border"
      >
        {chains.map((chain) => (
          <li key={chain.category.id} className="py-5">
            <CategoryCard
              chain={chain}
              data={data}
              directory={directory}
              open={open}
              setOpen={setOpen}
              onStages={(stages) =>
                onChange(setCategoryStages(rules, chain.category.id, stages))
              }
              disabled={disabled}
            />
          </li>
        ))}
      </ol>
      {others.length > 0 && (
        <p className="mt-3 text-meta text-muted-foreground">
          Also in force, under Advanced: {others.map((rule) => rule.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

function CategoryCard({
  chain,
  data,
  directory,
  open,
  setOpen,
  onStages,
  disabled,
}: {
  chain: CategoryChain;
  data: WorkflowConsoleData;
  directory: NamedDirectory;
  open: string | null;
  setOpen: (next: string | null) => void;
  onStages: (stages: ApprovalStage[]) => void;
  disabled: boolean;
}) {
  const { category, stages, sharedWith } = chain;
  const full = freeSlots(stages).length === 0;
  const insert = (at: number) => {
    const next = insertStage(stages, at);
    if (!next) return;
    onStages(next);
    setOpen(`${category.id}:${next[at].status}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="text-card font-semibold text-ink">{category.title}</h3>
        <p className="text-sm text-muted-foreground">{category.summary}</p>
      </div>

      <ol className="flex flex-wrap items-stretch gap-1.5">
        <li>
          <Box tone="fixed" title={category.submits} caption="submits" />
        </li>
        {stages.map((stage, i) => {
          const id = `${category.id}:${stage.status}`;
          return (
            <li key={stage.status} className="flex items-stretch gap-1.5">
              <Arrow />
              {!full && (
                <Insert
                  before={describeApprover(stage.approver, directory)}
                  onClick={() => insert(i)}
                  disabled={disabled}
                />
              )}
              <button
                type="button"
                disabled={disabled}
                aria-expanded={open === id}
                aria-label={`${stepName(stage, directory)} step ${i + 1} of ${stages.length}`}
                onClick={() => setOpen(open === id ? null : id)}
                className={cn(
                  "min-w-[14ch] rounded border px-3 py-2 text-left transition-colors",
                  open === id
                    ? "border-ink bg-band"
                    : "border-border-strong bg-white hover:bg-band"
                )}
              >
                <span className="block text-sm font-medium text-ink">
                  {stepName(stage, directory)}
                </span>
                {stages.length > 1 && (
                  <span className="block text-meta text-muted-foreground">
                    step {i + 1} of {stages.length}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li className="flex items-stretch gap-1.5">
          <Arrow />
          {!full && (
            <Insert
              before="the Guest House Manager"
              onClick={() => insert(stages.length)}
              disabled={disabled}
            />
          )}
          <Box tone="end" title="Guest House Manager" caption="approves" />
        </li>
      </ol>

      {full && (
        <p className="text-meta text-muted-foreground">
          A request can pass through at most {MAX_STEPS} approvers.
        </p>
      )}
      {sharedWith.length > 0 && (
        <div className="text-meta text-muted-foreground">
          <p>Shares a route with {sharedWith.map((c) => c.title).join(", ")}.</p>
          <p>A change here applies to {category.title} alone.</p>
        </div>
      )}

      {stages.map((stage, i) =>
        open === `${category.id}:${stage.status}` ? (
          <StepEditor
            key={stage.status}
            stage={stage}
            index={i}
            total={stages.length}
            data={data}
            directory={directory}
            onChange={(next) => onStages(stages.map((s, j) => (j === i ? next : s)))}
            onMove={(by) => onStages(moveStage(stages, i, by))}
            onRemove={() => {
              onStages(removeStage(stages, i));
              setOpen(null);
            }}
            disabled={disabled}
          />
        ) : null
      )}
    </div>
  );
}

function stepName(stage: ApprovalStage, directory: NamedDirectory): string {
  return stage.label?.trim() || describeApprover(stage.approver, directory);
}

/** A box in the chain that is not editable: who submits, and the desk. */
function Box({
  tone,
  title,
  caption,
}: {
  tone: "fixed" | "end";
  title: string;
  caption: string;
}) {
  return (
    <div
      className={cn(
        "min-w-[12ch] rounded border px-3 py-2",
        tone === "end" ? "border-ink bg-ink text-white" : "border-border bg-band"
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span
        className={cn(
          "block text-meta",
          tone === "end" ? "text-white/70" : "text-muted-foreground"
        )}
      >
        {caption}
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="flex items-center text-border-strong">
      <svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor">
        <path d="M0 5h16M12 1l4 4-4 4" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

function Insert({
  before,
  onClick,
  disabled,
}: {
  before: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Insert a step before ${before}`}
      title={`Insert a step before ${before}`}
      className="self-center rounded border border-dashed border-border-strong px-1.5 py-0.5 text-sm leading-none text-muted-foreground hover:border-ink hover:text-ink"
    >
      +
    </button>
  );
}

/**
 * Roles a step can be given to wholesale.
 *
 * Short on purpose. The engine takes any role, and the Advanced list still
 * offers all of them; this is the handful that means something as an
 * approval queue, and a long list of every role in the portal was part of
 * what made the old screen read as a database form.
 */
const APPROVER_ROLES: Role[] = ["warden", "iar_cell", "faculty_advisor", "gh_caretaker"];

function StepEditor({
  stage,
  index,
  total,
  data,
  directory,
  onChange,
  onMove,
  onRemove,
  disabled,
}: {
  stage: ApprovalStage;
  index: number;
  total: number;
  data: WorkflowConsoleData;
  directory: NamedDirectory;
  onChange: (next: ApprovalStage) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const id = `${stage.status}-${index}`;
  // Bound to a local, or the narrowing is lost inside the callback.
  const approver = stage.approver;
  const unit =
    approver.kind === "unit" ? data.units.find((u) => u.id === approver.unit_id) : null;

  return (
    <div className="space-y-3 border-l-2 border-vermilion/40 pl-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`who-${id}`}>Who decides this step</Label>
          <NativeSelect
            id={`who-${id}`}
            value={approverValue(stage.approver)}
            disabled={disabled}
            onChange={(e) => {
              const approver = approverFromValue(e.target.value);
              if (approver) onChange(setStageApprover(stage, approver, directory));
            }}
          >
            <optgroup label="Follows whoever booked">
              <option value="warden">Their hostel&apos;s Assistant Warden</option>
              <option value="hod">Their department&apos;s HOD</option>
              <option value="unit_head">The head of their own office or club</option>
            </optgroup>
            <optgroup label="One named person">
              {data.people.map((p) => (
                <option key={p.id} value={`profile:${p.id}`}>
                  {p.name} - {p.email}
                </option>
              ))}
            </optgroup>
            <optgroup label="The head of one department, office or club">
              {data.units.map((u) => (
                <option key={u.id} value={`unit:${u.id}`}>
                  {u.name}
                  {u.hasHead ? "" : " (nobody heads it)"}
                </option>
              ))}
            </optgroup>
            <optgroup label="Everyone holding a role">
              {APPROVER_ROLES.map((r) => (
                <option key={r} value={`role:${r}`}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </optgroup>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`name-${id}`}>Call this step (optional)</Label>
          <Input
            id={`name-${id}`}
            value={stage.label ?? ""}
            maxLength={60}
            disabled={disabled}
            placeholder={describeApprover(stage.approver, directory)}
            onChange={(e) => onChange(setStageLabel(stage, e.target.value))}
          />
        </div>
      </div>

      {unit && !unit.hasHead && (
        <p className="text-sm text-vermilion-deep">
          Nobody heads {unit.name}, so this step would be skipped.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          aria-label="Move this step earlier"
        >
          Earlier
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
          aria-label="Move this step later"
        >
          Later
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={onRemove}>
          Remove this step
        </Button>
      </div>
    </div>
  );
}

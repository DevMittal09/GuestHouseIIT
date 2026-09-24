"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addHostelAction,
  addOfficialEmailAction,
  removeHostelAction,
  removeOfficialEmailAction,
  renameHostelAction,
  saveRuleGroup,
  type SettingsConsoleData,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantityInput } from "@/components/ui/quantity-input";
import { TimeSelect } from "@/components/ui/time-select";
import { MEAL_KEYS, MEAL_LABELS } from "@/lib/meals";
import { ROOM_TYPE_LABELS } from "@/lib/occupancy";
import {
  DEFAULT_RULES,
  describeRuleChanges,
  ruleGroupError,
  type RuleGroup,
  type Rules,
} from "@/lib/settings";
import { DEBIT_HEAD_LABELS, type DebitHead, type RoomType } from "@/lib/types";
import {
  DEBIT_CATEGORIES,
  DEBIT_CATEGORY_LABELS,
  isHeadAllowedFor,
  STANDARD_DEBIT_HEADS,
  type DebitRules,
} from "@/lib/debit-heads";

type Result = { ok: boolean; error?: string };

/**
 * The developer console's Settings: every rule the office can change without
 * a deploy.
 *
 * Every save goes through a confirmation that lists exactly what will change,
 * and the server refuses — naming the bookings — any change that would break
 * one already made. Each save is recorded in the security audit log.
 */
export function SettingsManager({
  data,
  unitCount,
}: {
  data: SettingsConsoleData;
  unitCount: number;
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          The rules the portal applies. Each value starts at what the portal did before it could be
          changed. A change that would break a booking already made is refused, and the booking is
          named so you can deal with it first. Every change is written to the security audit log.
        </p>
      </div>

      <WhitelistSection emails={data.officialEmails} />
      <HostelsSection hostels={data.hostels} />

      <SettingCard
        title="Departments, clubs and offices"
        description="Departments, clubs, councils and offices, the HOD or head of each, and whether an office is an officer office (Director, Registrar, Deans — booked against the Institute Grant) or a department office (booked against its Department)."
      >
        <p className="text-sm">
          {unitCount} unit{unitCount === 1 ? "" : "s"} on record.{" "}
          <Link href="/admin/units" className="font-medium underline underline-offset-4">
            Manage them in Departments &amp; Clubs
          </Link>
          .
        </p>
      </SettingCard>

      {/* Keyed on the saved value: after a save the page refreshes with the
          new rules, and each section starts again from them rather than
          keeping a draft of the old ones. */}
      <CapacitySection key={JSON.stringify(data.rules.capacity)} current={data.rules.capacity} />
      <BookingWindowSection key={JSON.stringify(data.rules.booking)} current={data.rules.booking} />
      <MealWindowsSection key={JSON.stringify(data.rules.meals)} current={data.rules.meals} />
      <DebitHeadsSection key={JSON.stringify(data.rules.debit)} current={data.rules.debit} />
    </section>
  );
}

// ------------------------------------------------------------------ layout

export function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function useRunner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  return { isPending, run };
}

/**
 * Save / reset for one group of scalar rules, behind a confirmation that
 * spells out each change. Validation runs here first so an obvious mistake is
 * reported without a round trip; the server validates again regardless.
 */
export function RuleGroupActions<G extends RuleGroup>({
  group,
  current,
  draft,
  onReset,
  valid,
}: {
  group: G;
  current: Rules[G];
  draft: Rules[G] | null;
  onReset: () => void;
  valid: boolean;
}) {
  const { isPending, run } = useRunner();
  const [confirming, setConfirming] = useState(false);
  const changes = draft ? describeRuleChanges(current, draft) : [];
  const error = draft && valid ? ruleGroupError(group, draft) : null;
  const isDefault = JSON.stringify(current) === JSON.stringify(DEFAULT_RULES[group]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-destructive" role={error ? "alert" : undefined}>
        {!valid ? "Fill in every value." : error}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={isPending} onClick={onReset}>
          Undo edits
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || isDefault}
          onClick={() => run(() => saveRuleGroup(group, DEFAULT_RULES[group]), "Restored the defaults")}
        >
          Restore defaults
        </Button>
        <Button
          size="sm"
          disabled={isPending || !valid || Boolean(error) || changes.length === 0}
          onClick={() => setConfirming(true)}
        >
          Save
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Change these rules?"
        description="They apply from now on, to every new request and to the checks on bookings still waiting. The server refuses the change if it would break a booking already made."
        consequences={changes}
        confirmLabel="Save changes"
        pending={isPending}
        onConfirm={() =>
          run(() => saveRuleGroup(group, draft), "Settings saved", () => setConfirming(false))
        }
      />
    </div>
  );
}

/** A whole-number field kept as the raw string, so it can be cleared while typing. */
function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <QuantityInput id={id} value={value} onChange={onChange} min={min} max={max} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const toInt = (raw: string): number | null => (/^\d+$/.test(raw.trim()) ? Number(raw) : null);

// ------------------------------------------------------------------ whitelist

function WhitelistSection({ emails }: { emails: SettingsConsoleData["officialEmails"] }) {
  const { isPending, run } = useRunner();
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  return (
    <SettingCard
      title="Official / Dignitary whitelist"
      description="Only these accounts may submit Official / Dignitary bookings. An address in use by an Official account cannot be removed until that account's role is changed."
    >
      <ul className="divide-y rounded-md border">
        {emails.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">
            Nobody — no account can submit an official booking.
          </li>
        )}
        {emails.map((e) => (
          <li key={e.email} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span className="min-w-0 break-all">
              <span className="font-medium">{e.email}</span>
              <span className="text-muted-foreground">
                {e.account ? ` — ${e.account}` : " — no account yet"}
              </span>
            </span>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setRemoving(e.email)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          run(() => addOfficialEmailAction(email), `${email} whitelisted`, () => setEmail(""));
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="official-email">Add an address</Label>
          <Input
            id="official-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="registrar@iitpkd.ac.in"
          />
        </div>
        <Button type="submit" disabled={isPending || !email.includes("@")}>
          Add
        </Button>
      </form>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove from the whitelist?"
        description={`${removing ?? ""} will no longer be able to submit Official / Dignitary bookings. Bookings already made are not affected.`}
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={() =>
          removing &&
          run(() => removeOfficialEmailAction(removing), `${removing} removed`, () => setRemoving(null))
        }
      />
    </SettingCard>
  );
}

// ------------------------------------------------------------------ hostels

function HostelsSection({ hostels }: { hostels: SettingsConsoleData["hostels"] }) {
  const { isPending, run } = useRunner();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  return (
    <SettingCard
      title="Hostels"
      description="The hostels students are assigned to and Assistant Wardens are scoped by. Renaming one moves every account in it. A hostel anyone still lives in cannot be removed."
    >
      <ul className="divide-y rounded-md border">
        {hostels.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">No hostels yet.</li>
        )}
        {hostels.map((h) => (
          <li key={h.name} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            {editing?.from === h.name ? (
              <form
                className="flex min-w-0 flex-1 flex-wrap gap-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  run(
                    () => renameHostelAction(editing.from, editing.to),
                    `Renamed to ${editing.to}`,
                    () => setEditing(null)
                  );
                }}
              >
                <Input
                  aria-label={`New name for ${h.name}`}
                  className="min-w-0 flex-1"
                  value={editing.to}
                  onChange={(e) => setEditing({ ...editing, to: e.target.value })}
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={isPending || editing.to.trim().length < 2}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <span>
                  <span className="font-medium">{h.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {h.accounts} account{h.accounts === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setEditing({ from: h.name, to: h.name })}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending || h.accounts > 0}
                    title={h.accounts > 0 ? "Move its accounts to another hostel first" : undefined}
                    onClick={() => setRemoving(h.name)}
                  >
                    Remove
                  </Button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          run(() => addHostelAction(name), `${name} added`, () => setName(""));
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="hostel-name">Add a hostel</Label>
          <Input
            id="hostel-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tilang"
          />
        </div>
        <Button type="submit" disabled={isPending || name.trim().length < 2}>
          Add
        </Button>
      </form>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this hostel?"
        description={`${removing ?? ""} will no longer be offered when assigning students or wardens.`}
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={() =>
          removing && run(() => removeHostelAction(removing), `${removing} removed`, () => setRemoving(null))
        }
      />
    </SettingCard>
  );
}

// ------------------------------------------------------------------ capacity

const ROOM_TYPES: RoomType[] = ["double_sharing", "single"];

function CapacitySection({ current }: { current: Rules["capacity"] }) {
  const initial = () => ({
    room_types: Object.fromEntries(
      ROOM_TYPES.map((t) => [
        t,
        {
          standard: String(current.room_types[t].standard),
          withExtraBed: String(current.room_types[t].withExtraBed),
        },
      ])
    ) as Record<RoomType, { standard: string; withExtraBed: string }>,
    max_guests_per_room: String(current.max_guests_per_room),
    max_infants_per_room: String(current.max_infants_per_room),
    max_occupants_per_room: String(current.max_occupants_per_room),
  });
  const [raw, setRaw] = useState(initial);

  const parsed = (() => {
    const types = {} as Rules["capacity"]["room_types"];
    for (const t of ROOM_TYPES) {
      const standard = toInt(raw.room_types[t].standard);
      const withExtraBed = toInt(raw.room_types[t].withExtraBed);
      if (standard === null || withExtraBed === null) return null;
      types[t] = { standard, withExtraBed };
    }
    const guests = toInt(raw.max_guests_per_room);
    const infants = toInt(raw.max_infants_per_room);
    const occupants = toInt(raw.max_occupants_per_room);
    if (guests === null || infants === null || occupants === null) return null;
    return {
      room_types: types,
      max_guests_per_room: guests,
      max_infants_per_room: infants,
      max_occupants_per_room: occupants,
    };
  })();

  return (
    <SettingCard
      title="Room capacity"
      description="Two rules, checked at different times. Per room type: how many beds a room has, and the most it holds once an extra bed is rolled in — checked when the manager allocates rooms. Per room on the form: how many guests, how many infants and how many people in all one room card may hold — checked when the request is submitted, before the room's type is known, and again by the database. The three together are what make the rule a combination: 3 guests + 1 infant and 2 guests + 2 infants both fit, 3 guests + 2 infants does not."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {ROOM_TYPES.map((t) => (
          <fieldset key={t} className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{ROOM_TYPE_LABELS[t]}</legend>
            <NumberField
              id={`cap-${t}-standard`}
              label="Beds in the room"
              value={raw.room_types[t].standard}
              min={1}
              max={10}
              onChange={(v) =>
                setRaw({ ...raw, room_types: { ...raw.room_types, [t]: { ...raw.room_types[t], standard: v } } })
              }
            />
            <NumberField
              id={`cap-${t}-extra`}
              label="Maximum with an extra bed"
              value={raw.room_types[t].withExtraBed}
              min={1}
              max={12}
              onChange={(v) =>
                setRaw({ ...raw, room_types: { ...raw.room_types, [t]: { ...raw.room_types[t], withExtraBed: v } } })
              }
            />
          </fieldset>
        ))}
        <NumberField
          id="cap-guests"
          label="Guests per room card"
          value={raw.max_guests_per_room}
          min={1}
          max={12}
          hint="Bed-occupying guests, extra bed included."
          onChange={(v) => setRaw({ ...raw, max_guests_per_room: v })}
        />
        <NumberField
          id="cap-infants"
          label="Infants per room card"
          value={raw.max_infants_per_room}
          min={0}
          max={6}
          hint="Infants share a guardian's bed. 0 stops infants being booked."
          onChange={(v) => setRaw({ ...raw, max_infants_per_room: v })}
        />
        <NumberField
          id="cap-occupants"
          label="People per room card, in all"
          value={raw.max_occupants_per_room}
          min={1}
          max={16}
          hint="Guests and infants together. This is what refuses 3 guests + 2 infants while allowing 2 guests + 2 infants."
          onChange={(v) => setRaw({ ...raw, max_occupants_per_room: v })}
        />
      </div>
      <RuleGroupActions
        group="capacity"
        current={current}
        draft={parsed}
        valid={parsed !== null}
        onReset={() => setRaw(initial())}
      />
    </SettingCard>
  );
}

// ------------------------------------------------------------- booking window

function BookingWindowSection({ current }: { current: Rules["booking"] }) {
  const initial = () => ({
    advance_booking_months: String(current.advance_booking_months),
    max_stay_nights: String(current.max_stay_nights),
    buffer_minutes: String(current.buffer_minutes),
    no_show_release_hours: String(current.no_show_release_hours),
  });
  const [raw, setRaw] = useState(initial);
  const months = toInt(raw.advance_booking_months);
  const nights = toInt(raw.max_stay_nights);
  const buffer = toInt(raw.buffer_minutes);
  const noShow = toInt(raw.no_show_release_hours);
  const parsed =
    months === null || nights === null || buffer === null || noShow === null
      ? null
      : {
          ...current,
          advance_booking_months: months,
          max_stay_nights: nights,
          buffer_minutes: buffer,
          no_show_release_hours: noShow,
        };

  return (
    <SettingCard
      title="Booking window, stay length and turnaround"
      description="How far ahead a check-in may be requested, and the longest ordinary stay — Official / Dignitary bookings, the Guest House Manager and the developer are exempt from both, and only new requests are checked. The turnaround buffer is the least time between one guest checking out and the next checking in to the same room, for housekeeping; changing it re-checks every allocated stay and is refused, naming them, if any two would clash."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="booking-months"
          label="Advance-booking window (months)"
          value={raw.advance_booking_months}
          min={1}
          max={24}
          onChange={(v) => setRaw({ ...raw, advance_booking_months: v })}
        />
        <NumberField
          id="booking-nights"
          label="Maximum stay (nights)"
          value={raw.max_stay_nights}
          min={0}
          max={365}
          hint="0 means no limit."
          onChange={(v) => setRaw({ ...raw, max_stay_nights: v })}
        />
        <NumberField
          id="booking-buffer"
          label="Turnaround buffer (minutes)"
          value={raw.buffer_minutes}
          min={0}
          max={1440}
          hint="240 = 4 hours. 0 turns it off. The manager can still accept a tighter changeover on a room."
          onChange={(v) => setRaw({ ...raw, buffer_minutes: v })}
        />
        <NumberField
          id="booking-no-show"
          label="Release no-shows after (hours)"
          value={raw.no_show_release_hours}
          min={0}
          max={168}
          hint="An approved stay nobody has checked in to this long after its check-in is released by the daily job, and the requester told. 0 turns it off; the manager can always release one by hand."
          onChange={(v) => setRaw({ ...raw, no_show_release_hours: v })}
        />
      </div>
      <RuleGroupActions
        group="booking"
        current={current}
        draft={parsed}
        valid={parsed !== null}
        onReset={() => setRaw(initial())}
      />
    </SettingCard>
  );
}

// ------------------------------------------------------------- meal windows

function MealWindowsSection({ current }: { current: Rules["meals"] }) {
  const [windows, setWindows] = useState(current.windows);
  const draft = { windows };

  return (
    <SettingCard
      title="Meal serving times"
      description="When each meal is served. A meal can be booked on a day only if the stay covers part of its serving time, so these decide which cells of the meal grid are offered. A change that would put meals already booked outside their stay is refused."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {MEAL_KEYS.map((meal) => (
          <fieldset key={meal} className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{MEAL_LABELS[meal]}</legend>
            <TimeSelect
              label="From"
              value={windows[meal].start}
              onChange={(v) => setWindows({ ...windows, [meal]: { ...windows[meal], start: v } })}
            />
            <TimeSelect
              label="Until"
              value={windows[meal].end}
              onChange={(v) => setWindows({ ...windows, [meal]: { ...windows[meal], end: v } })}
            />
          </fieldset>
        ))}
      </div>
      <RuleGroupActions
        group="meals"
        current={current}
        draft={draft}
        valid
        onReset={() => setWindows(current.windows)}
      />
    </SettingCard>
  );
}

// ------------------------------------------------------------- debitable heads

/** The two grids; `revision` rides along in the draft untouched. */
type DebitKind = "room" | "dining";

function DebitHeadsSection({ current }: { current: Rules["debit"] }) {
  const [draft, setDraft] = useState<DebitRules>(current);
  // The five heads the invoice names, plus any legacy head a saved row still
  // uses, so nothing configured disappears from view.
  const heads: DebitHead[] = [
    ...STANDARD_DEBIT_HEADS,
    ...(Object.values({ ...current.room, ...current.dining })
      .flat()
      .filter((h) => !STANDARD_DEBIT_HEADS.includes(h)) as DebitHead[]),
  ].filter((h, i, all) => all.indexOf(h) === i);

  const toggle = (kind: DebitKind, category: (typeof DEBIT_CATEGORIES)[number], head: DebitHead) =>
    setDraft((d) => {
      const list = d[kind][category];
      const next = list.includes(head) ? list.filter((h) => h !== head) : [...list, head];
      return { ...d, [kind]: { ...d[kind], [category]: next } };
    });

  const grid = (kind: DebitKind, title: string) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2 font-medium">Requester</th>
              {heads.map((h) => (
                <th key={h} className="p-2 text-center font-medium">
                  {DEBIT_HEAD_LABELS[h]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEBIT_CATEGORIES.map((category) => (
              <tr key={category} className="border-b last:border-0">
                <td className="p-2">{DEBIT_CATEGORY_LABELS[category]}</td>
                {heads.map((h) => {
                  // Dining is never charged to a project, and a few
                  // category/head pairs are refused outright by the rules
                  // themselves (faculty cannot debit the Institute Grant) —
                  // shown greyed rather than hidden, so the table still reads
                  // as one grid and the reason is in the tooltip.
                  const forbidden = !isHeadAllowedFor(category, h);
                  const disabled = (kind === "dining" && h === "project_grant") || forbidden;
                  return (
                    <td key={h} className="p-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${DEBIT_CATEGORY_LABELS[category]}: ${DEBIT_HEAD_LABELS[h]} (${title})`}
                        title={
                          forbidden
                            ? `${DEBIT_CATEGORY_LABELS[category]} cannot be charged to the ${DEBIT_HEAD_LABELS[h]}`
                            : undefined
                        }
                        className="size-4 accent-primary"
                        disabled={disabled}
                        checked={!forbidden && draft[kind][category].includes(h)}
                        onChange={() => toggle(kind, category, h)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <SettingCard
      title="Debitable heads"
      description="Which budget each kind of requester may charge a booking to. Every official booking must name one; Project also asks for a project from the Projects list. A requester with only one head is not asked — the form states it. Bookings already made keep the head they were made with."
    >
      {grid("room", "Room bookings")}
      {grid("dining", "Dining (meals only)")}
      <RuleGroupActions
        group="debit"
        current={current}
        draft={draft}
        valid
        onReset={() => setDraft(current)}
      />
    </SettingCard>
  );
}

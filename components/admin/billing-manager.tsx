"use client";

import { useState } from "react";
import { createTariffAction, deleteTariffAction } from "@/app/actions/invoices";
import { RuleGroupActions, SettingCard, useRunner } from "@/components/admin/settings-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatINR, toPaise } from "@/lib/invoice";
import { ROOM_TYPE_LABELS } from "@/lib/occupancy";
import type { InvoiceRules } from "@/lib/settings";
import {
  describeTariffScope,
  TARIFF_ITEM_LABELS,
  TARIFF_ITEMS,
  type Tariff,
  type TariffItem,
} from "@/lib/tariffs";
import { formatDateValue } from "@/lib/tz";
import { BOOKING_TYPE_LABELS, ROLE_LABELS, type BookingType, type Role, type RoomType } from "@/lib/types";

/**
 * Tariffs & Invoicing (Phase 5): the rates, by date, and how invoices are
 * numbered, charged and printed. The Guest House Manager's to run, as well as
 * the developer's.
 */

const TARIFF_ROLES: Role[] = ["student", "employee", "official", "club", "iar_cell", "iar_student_cell", "gh_manager"];

export function BillingManager({
  rules,
  tariffs,
  guestHouses,
  today,
}: {
  rules: InvoiceRules;
  tariffs: Tariff[];
  guestHouses: { id: string; name: string }[];
  today: string;
}) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tariffs &amp; Invoicing</h2>
        <p className="text-sm text-muted-foreground">
          What a stay costs and how its invoice is numbered and printed. Issued invoices keep the
          rates and details they were issued with — nothing here changes an invoice already handed
          over.
        </p>
      </div>
      <TariffsSection tariffs={tariffs} guestHouses={guestHouses} today={today} />
      <InvoiceRulesSection key={JSON.stringify(rules)} current={rules} />
    </section>
  );
}

// ---------------------------------------------------------------- tariffs

function TariffsSection({
  tariffs,
  guestHouses,
  today,
}: {
  tariffs: Tariff[];
  guestHouses: { id: string; name: string }[];
  today: string;
}) {
  const { isPending, run } = useRunner();
  const [deleting, setDeleting] = useState<Tariff | null>(null);
  const names = {
    guestHouse: (id: string) => guestHouses.find((g) => g.id === id)?.name ?? "A removed guest house",
    roomType: (t: RoomType) => ROOM_TYPE_LABELS[t],
    bookingType: (t: BookingType) => BOOKING_TYPE_LABELS[t],
    role: (r: Role) => ROLE_LABELS[r] ?? r,
  };
  const sorted = [...tariffs].sort(
    (a, b) =>
      TARIFF_ITEMS.indexOf(a.item) - TARIFF_ITEMS.indexOf(b.item) ||
      describeTariffScope(a, names).localeCompare(describeTariffScope(b, names)) ||
      b.effective_from.localeCompare(a.effective_from)
  );
  const hasExtraBed = tariffs.some((t) => t.item === "extra_bed");

  return (
    <SettingCard
      title="Rates"
      description="Each rate applies from its date until a later one replaces it. A blank qualifier means “any”; the most specific rate that fits a charge is used (guest house, then requester, then booking type, then room type). A rate in force cannot be edited or deleted — add the new price from a future date instead."
    >
      {!hasExtraBed && (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          ⚠ No extra-bed rate is set. The tariff sheet does not give one, so a stay with an extra bed
          cannot be invoiced until you add it below.
        </p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2 font-medium">Charge</th>
              <th className="p-2 font-medium">Applies to</th>
              <th className="p-2 text-right font-medium">Rate</th>
              <th className="p-2 font-medium">From</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const future = t.effective_from > today;
              return (
                <tr key={t.id} className="border-t align-top">
                  <td className="p-2">{TARIFF_ITEM_LABELS[t.item]}</td>
                  <td className="p-2">
                    {describeTariffScope(t, names)}
                    {t.note && <span className="block text-xs text-muted-foreground">{t.note}</span>}
                  </td>
                  <td className="p-2 text-right tabular-nums">{formatINR(toPaise(t.rate))}</td>
                  <td className="p-2 whitespace-nowrap">
                    {formatDateValue(t.effective_from, { weekday: false, year: true })}
                    {future && (
                      <Badge variant="outline" className="ml-2">
                        Upcoming
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {future ? (
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => setDeleting(t)}>
                        Remove
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground" title="In force — add a new rate instead">
                        🔒 In force
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <NewTariffForm guestHouses={guestHouses} today={today} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this upcoming rate?"
        description={
          deleting
            ? `${TARIFF_ITEM_LABELS[deleting.item]} at ${formatINR(toPaise(deleting.rate))} from ${deleting.effective_from} will not come into force.`
            : ""
        }
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={() => deleting && run(() => deleteTariffAction(deleting.id), "Rate removed", () => setDeleting(null))}
      />
    </SettingCard>
  );
}

function NewTariffForm({ guestHouses, today }: { guestHouses: { id: string; name: string }[]; today: string }) {
  const { isPending, run } = useRunner();
  const blank = {
    item: "room" as TariffItem,
    guest_house_id: "",
    room_type: "",
    booking_type: "",
    requester_role: "",
    rate: "",
    effective_from: today,
    note: "",
  };
  const [draft, setDraft] = useState(blank);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const roomish = draft.item === "room" || draft.item === "extra_bed";

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">Add a rate</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Charge" id="t-item">
          <NativeSelect id="t-item" value={draft.item} onChange={set("item")}>
            {TARIFF_ITEMS.map((i) => (
              <option key={i} value={i}>
                {TARIFF_ITEM_LABELS[i]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Guest house" id="t-gh">
          <NativeSelect id="t-gh" value={draft.guest_house_id} onChange={set("guest_house_id")}>
            <option value="">Any</option>
            {guestHouses.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Room type" id="t-room">
          <NativeSelect id="t-room" value={roomish ? draft.room_type : ""} onChange={set("room_type")} disabled={!roomish}>
            <option value="">Any</option>
            {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((r) => (
              <option key={r} value={r}>
                {ROOM_TYPE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Booking type" id="t-type">
          <NativeSelect id="t-type" value={draft.booking_type} onChange={set("booking_type")}>
            <option value="">Any</option>
            {(Object.keys(BOOKING_TYPE_LABELS) as BookingType[]).map((b) => (
              <option key={b} value={b}>
                {BOOKING_TYPE_LABELS[b]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Requester" id="t-role">
          <NativeSelect id="t-role" value={draft.requester_role} onChange={set("requester_role")}>
            <option value="">Any</option>
            {TARIFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Rate (₹)" id="t-rate">
          <Input id="t-rate" inputMode="decimal" value={draft.rate} onChange={set("rate")} placeholder="2000" />
        </Field>
        <Field label="Applies from" id="t-from">
          <Input id="t-from" type="date" value={draft.effective_from} onChange={set("effective_from")} />
        </Field>
        <Field label="Note (optional)" id="t-note">
          <Input id="t-note" value={draft.note} onChange={set("note")} maxLength={200} />
        </Field>
      </div>
      {draft.effective_from < today && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          A back-dated rate applies to invoices issued from now on for stays on those dates; invoices
          already issued keep their rates.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={isPending || draft.rate.trim() === ""}
          onClick={() =>
            run(
              () =>
                createTariffAction({
                  item: draft.item,
                  guest_house_id: draft.guest_house_id || null,
                  room_type: roomish ? draft.room_type || null : null,
                  booking_type: draft.booking_type || null,
                  requester_role: draft.requester_role || null,
                  rate: draft.rate,
                  effective_from: draft.effective_from,
                  note: draft.note.trim() || null,
                }),
              "Rate added",
              () => setDraft(blank)
            )
          }
        >
          Add rate
        </Button>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------- invoice rules

function InvoiceRulesSection({ current }: { current: InvoiceRules }) {
  const [draft, setDraft] = useState<InvoiceRules>(current);
  const top = (k: "serial_prefix" | "gstin" | "accounts_email") => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const num = (k: "serial_digits" | "grace_hours" | "gst_percent") => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) }));
  const bank = (k: keyof InvoiceRules["bank"]) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, bank: { ...d.bank, [k]: e.target.value } }));
  const contact = (k: keyof InvoiceRules["contact"]) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, contact: { ...d.contact, [k]: e.target.value } }));
  const valid = [draft.serial_digits, draft.grace_hours, draft.gst_percent].every(
    (v) => typeof v === "number" && Number.isFinite(v)
  );
  const sample = `${draft.serial_prefix || "GH"}/2026-27/${"1".padStart(Number(draft.serial_digits) || 4, "0")}`;

  return (
    <SettingCard
      title="Invoice"
      description="Numbering, how days are counted, GST, and what is printed at the foot of every invoice. Official invoices are mailed to the Accounts address when issued, with the requester's HOD and the requester copied; leave it blank to mail nothing."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Number prefix" id="i-prefix">
          <Input id="i-prefix" value={draft.serial_prefix} onChange={top("serial_prefix")} maxLength={10} />
        </Field>
        <Field label="Digits in the running number" id="i-digits">
          <Input id="i-digits" type="number" min={3} max={6} value={draft.serial_digits} onChange={num("serial_digits")} />
        </Field>
        <div className="flex items-end pb-2 text-sm text-muted-foreground">
          Next year starts again at <span className="ml-1 font-mono text-foreground">{sample}</span>
        </div>
        <Field label="Day(s) on the invoice count" id="i-basis">
          <NativeSelect
            id="i-basis"
            value={draft.day_basis}
            onChange={(e) => setDraft((d) => ({ ...d, day_basis: e.target.value as InvoiceRules["day_basis"] }))}
          >
            <option value="night">Nights (calendar dates)</option>
            <option value="24h">24-hour blocks from check-in</option>
          </NativeSelect>
        </Field>
        <Field label="Grace before another 24 h (hours)" id="i-grace">
          <Input
            id="i-grace"
            type="number"
            min={0}
            max={12}
            value={draft.grace_hours}
            onChange={num("grace_hours")}
            disabled={draft.day_basis !== "24h"}
          />
        </Field>
        <Field label="GST on total (%)" id="i-gst">
          <Input id="i-gst" type="number" min={0} max={28} step="0.01" value={draft.gst_percent} onChange={num("gst_percent")} />
        </Field>
        <Field label="GSTIN" id="i-gstin">
          <Input id="i-gstin" value={draft.gstin} onChange={top("gstin")} maxLength={15} className="font-mono" />
        </Field>
        <Field label="Accounts email (official invoices)" id="i-accounts">
          <Input
            id="i-accounts"
            type="email"
            value={draft.accounts_email}
            onChange={top("accounts_email")}
            placeholder="accounts@iitpkd.ac.in"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Account holder" id="b-holder">
          <Input id="b-holder" value={draft.bank.account_holder} onChange={bank("account_holder")} />
        </Field>
        <Field label="Account number" id="b-number">
          <Input id="b-number" value={draft.bank.account_number} onChange={bank("account_number")} inputMode="numeric" />
        </Field>
        <Field label="Bank" id="b-bank">
          <Input id="b-bank" value={draft.bank.bank_name} onChange={bank("bank_name")} />
        </Field>
        <Field label="IFSC" id="b-ifsc">
          <Input id="b-ifsc" value={draft.bank.ifsc} onChange={bank("ifsc")} className="font-mono" />
        </Field>
        <Field label="Branch" id="b-branch">
          <Input id="b-branch" value={draft.bank.branch} onChange={bank("branch")} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Address on the footer" id="c-address">
          <Input id="c-address" value={draft.contact.address} onChange={contact("address")} />
        </Field>
        <Field label="Phone" id="c-phone">
          <Input id="c-phone" value={draft.contact.phone} onChange={contact("phone")} />
        </Field>
        <Field label="Email" id="c-email">
          <Input id="c-email" value={draft.contact.email} onChange={contact("email")} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        The Hindi half of the footer address (कंजिकोड पश्चिम, पालक्काड, केरल - ६७८ ६२३) is fixed
        artwork from the office&apos;s template.
      </p>
      <RuleGroupActions group="invoice" current={current} draft={draft} valid={valid} onReset={() => setDraft(current)} />
    </SettingCard>
  );
}

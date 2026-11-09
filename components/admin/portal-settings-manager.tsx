"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RuleGroupActions, SettingCard } from "@/components/admin/settings-manager";
import { ROLE_LABELS, type Role } from "@/lib/types";
import type { Rules } from "@/lib/settings";
import { VIP_STAFF_ROLES } from "@/lib/rooms-access";

/**
 * **The Guest House Manager's own settings** (9 Nov 2026, the meeting): who
 * may be allotted a VIP room, how many free rooms a general requester is
 * shown, and where the full guidelines live.
 *
 * A console section of its own rather than three cards on the developer's
 * Settings page, because the meeting put all three in the manager's hands:
 * "the GHM should have a settings interface to change which rooms are
 * designated as VIP", "the GHM should be able to add or remove authorized
 * email addresses and user groups", "the GHM must have a backend settings
 * field to update the Google Drive URL... without requiring a code
 * deployment". A developer-only page would mean each of those waits on a
 * developer, which is the thing this console exists to avoid.
 *
 * **Which rooms are VIP is not here.** It is a property of the room, set in
 * Guest Houses & Rooms beside the room it describes - the same reasoning that
 * keeps "serves meals" on the guest house rather than in a list of guest
 * house names somewhere else. This page is who may *have* one.
 */
export function PortalSettingsManager({ current }: { current: Rules["portal"] }) {
  const initial = () => ({
    emails: current.vip_emails.join("\n"),
    roles: [...current.vip_roles],
    visible: String(current.general_visible_rooms),
    guidelines: current.guidelines_url,
  });
  const [raw, setRaw] = useState(initial);

  const emails = raw.emails
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const badEmail = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) ?? null;
  const visible = /^\d+$/.test(raw.visible.trim()) ? Number(raw.visible) : null;
  const guidelines = raw.guidelines.trim();
  const badUrl = guidelines !== "" && !/^https:\/\/\S+$/.test(guidelines);

  const draft: Rules["portal"] | null =
    badEmail || badUrl || (visible === null || visible < 1 || visible > 14)
      ? null
      : {
          vip_emails: [...new Set(emails)],
          vip_roles: raw.roles,
          general_visible_rooms: visible,
          guidelines_url: guidelines,
        };

  /** Every role except the ones that reach a VIP room whatever this says. */
  const assignable = (Object.keys(ROLE_LABELS) as Role[]).filter(
    (r) => !VIP_STAFF_ROLES.includes(r)
  );

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Portal Settings</h2>
        <p className="text-sm text-muted-foreground">
          Who may be allotted a VIP room, how much of the inventory a general requester is told
          about, and the link to the institute&apos;s full guidelines. Every change is written to
          the security audit log.
        </p>
      </div>

      <SettingCard
        title="VIP rooms: who may be allotted one"
        description="A VIP room is allotted only to a booking raised by one of these addresses, or by an account holding one of these roles. Which rooms are VIP is set on the room itself, in Guest Houses & Rooms. The Guest House Manager and the developer always reach them - the desk allots the Director's rooms, which is what makes them bookable at all."
      >
        <div className="space-y-2">
          <Label htmlFor="vip-emails">Authorised addresses</Label>
          <textarea
            id="vip-emails"
            rows={5}
            value={raw.emails}
            onChange={(e) => setRaw({ ...raw, emails: e.target.value })}
            className="border-input w-full rounded border bg-transparent px-3 py-2 font-mono text-sm"
            placeholder={"director@iitpkd.ac.in\noffice_director@iitpkd.ac.in"}
          />
          <p className="text-xs text-muted-foreground">
            One per line. {emails.length} address{emails.length === 1 ? "" : "es"}.
          </p>
          {badEmail && (
            <p className="text-sm text-destructive" role="alert">
              {badEmail} is not an email address.
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Authorised roles</legend>
          <p className="text-xs text-muted-foreground">
            A whole group of accounts, rather than one address at a time. Usually none.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {assignable.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={raw.roles.includes(role)}
                  onChange={(e) =>
                    setRaw({
                      ...raw,
                      roles: e.target.checked
                        ? [...raw.roles, role]
                        : raw.roles.filter((r) => r !== role),
                    })
                  }
                  className="size-4 accent-[var(--ink)]"
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-sm">
          Designate a room as VIP or reserved in{" "}
          <Link href="/admin/guest-houses" className="font-medium underline underline-offset-4">
            Guest Houses &amp; Rooms
          </Link>
          .
        </p>
      </SettingCard>

      <SettingCard
        title="What a general requester is shown"
        description="The most free rooms a requester is ever told about. The figure still falls as rooms are taken, and the total inventory is never published - a requester sees a count, never a fraction. The desk is not capped: the manager and the caretaker keep the whole inventory."
      >
        <div className="max-w-xs space-y-2">
          <Label htmlFor="visible-rooms">Rooms shown at most</Label>
          <Input
            id="visible-rooms"
            inputMode="numeric"
            value={raw.visible}
            onChange={(e) => setRaw({ ...raw, visible: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Enter a number from 1 to 14.</p>
        </div>
      </SettingCard>

      <SettingCard
        title="The full guidelines document"
        description="The link behind “Read the full guidelines” on the public Guidelines page. Paste the Google Drive address of the current version; leaving it empty hides the link rather than publishing a dead one."
      >
        <div className="space-y-2">
          <Label htmlFor="guidelines-url">Guidelines link</Label>
          <Input
            id="guidelines-url"
            value={raw.guidelines}
            onChange={(e) => setRaw({ ...raw, guidelines: e.target.value })}
            placeholder="https://drive.google.com/…"
          />
          {badUrl && (
            <p className="text-sm text-destructive" role="alert">
              The link must start with https://, or be empty to hide the button.
            </p>
          )}
          {guidelines !== "" && !badUrl && (
            <a
              href={guidelines}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium underline underline-offset-4"
            >
              Open it in a new tab to check it
            </a>
          )}
        </div>
      </SettingCard>

      <RuleGroupActions
        group="portal"
        current={current}
        draft={draft}
        valid={draft !== null}
        onReset={() => setRaw(initial())}
      />
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveRuleGroup } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PolicyRules } from "@/lib/settings";

type House = { id: string; name: string; rooms: { id: string; room_number: string }[] };

/**
 * Console -> VIP Rooms & Guidelines (4 Nov 2026, the owner's sixteenth
 * list). One form, saved as one `rules.policy` row through `saveRuleGroup`,
 * which re-checks the section and validates every field.
 *
 * The VIP rooms are saved as the ticks on screen, so the first save turns the
 * C1 / C2 default into a list of the manager's own - even an empty one.
 */
export function PolicyManager({
  policy,
  houses,
  vipRoomIds,
  fixedVipEmails,
}: {
  policy: PolicyRules;
  houses: House[];
  /** The VIP rooms as they stand, the default resolved. */
  vipRoomIds: string[];
  fixedVipEmails: string[];
}) {
  const router = useRouter();
  const [vip, setVip] = useState<Set<string>>(() => new Set(vipRoomIds));
  const [emails, setEmails] = useState(policy.vip_emails.join("\n"));
  const [cap, setCap] = useState(String(policy.visible_room_cap));
  const [url, setUrl] = useState(policy.guidelines_url);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setVip((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const proposed: PolicyRules = {
      vip_room_ids: houses.flatMap((h) => h.rooms.map((r) => r.id)).filter((id) => vip.has(id)),
      vip_emails: emails
        .split(/[\s,;]+/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
      visible_room_cap: Number(cap),
      guidelines_url: url.trim(),
    };
    startTransition(async () => {
      const result = await saveRuleGroup("policy", proposed);
      if (result.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>VIP rooms</CardTitle>
          <CardDescription>
            A VIP room is not counted as free for anyone without VIP access, and can be allocated
            only to a booking raised by an account with VIP access, or by the Guest House Manager.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {houses.map((house) => (
            <fieldset key={house.id}>
              <legend className="mb-2 font-heading text-base font-semibold text-ink">
                {house.name}
              </legend>
              {house.rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rooms.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                  {house.rooms.map((room) => (
                    <label
                      key={room.id}
                      className="flex cursor-pointer items-center gap-2 rounded border border-border px-2.5 py-2 text-sm font-semibold tabular-nums"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={vip.has(room.id)}
                        onChange={() => toggle(room.id)}
                      />
                      {room.room_number}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who has VIP access</CardTitle>
          <CardDescription>
            Always: {fixedVipEmails.join(", ")}. Add any other account below, one address per line.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="vip-emails">Other accounts with VIP access</Label>
          <Textarea
            id="vip-emails"
            rows={4}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="registrar@iitpkd.ac.in"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rooms shown to requesters</CardTitle>
          <CardDescription>
            The most rooms a requester is ever told are free, across both guest houses. Every room
            already booked comes off it. 0 shows every free room.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="visible-room-cap">Rooms shown at most</Label>
          <Input
            id="visible-room-cap"
            type="number"
            min={0}
            className="w-28"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guidelines document</CardTitle>
          <CardDescription>
            The Google Drive link the Guidelines button opens. Paste the new link whenever the
            policy document is updated; leave it empty to hide the button.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="guidelines-url">Guidelines link</Label>
          <Input
            id="guidelines-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
          />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

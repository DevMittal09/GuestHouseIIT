"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AUDIT_EVENT_LABELS, type AuditEvent, type AuditEventKind } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateTime } from "@/lib/format";

/**
 * The audit log as a table: newest first, filtered by kind or free text. The
 * details column shows what changed — the same JSON the row stores, which is
 * what an incident review needs.
 */
export function AuditLog({
  events,
  event,
  q,
  retentionDays,
}: {
  events: AuditEvent[];
  event: string;
  q: string;
  retentionDays: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/admin/audit?${next.toString()}`);
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Security audit log</h2>
        <p className="text-sm text-muted-foreground">
          Sign-ins, role and settings changes, document views, exports, invoices and overrides. Rows
          cannot be edited or deleted; they are removed only by the daily job, and never before{" "}
          {retentionDays} days.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          apply({ q: String(form.get("q") ?? ""), event: String(form.get("event") ?? "") });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="audit-event">Kind</Label>
          <NativeSelect id="audit-event" name="event" defaultValue={event} className="w-64">
            <option value="">All events</option>
            {(Object.keys(AUDIT_EVENT_LABELS) as AuditEventKind[]).map((k) => (
              <option key={k} value={k}>
                {AUDIT_EVENT_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-q">Search</Label>
          <Input id="audit-q" name="q" defaultValue={q} placeholder="Person, target or detail" className="w-64" />
        </div>
        <Button type="submit">Show</Button>
        {(event || q) && (
          <Button type="button" variant="outline" onClick={() => router.push("/admin/audit")}>
            Clear
          </Button>
        )}
      </form>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Nothing recorded for this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 font-medium">When</th>
                <th className="p-2 font-medium">Who</th>
                <th className="p-2 font-medium">Event</th>
                <th className="p-2 font-medium">Target</th>
                <th className="p-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{formatDateTime(e.at)}</td>
                  <td className="p-2">
                    {e.actor_name}
                    {e.actor_role && (
                      <Badge variant="outline" className="ml-2">
                        {e.actor_role}
                      </Badge>
                    )}
                    <span className="block text-xs text-muted-foreground">{e.ip ?? "—"}</span>
                  </td>
                  <td className="p-2">{AUDIT_EVENT_LABELS[e.event] ?? e.event}</td>
                  <td className="p-2 break-all">{e.target ?? "—"}</td>
                  <td className="p-2">
                    <code className="text-xs break-all text-muted-foreground">
                      {Object.keys(e.details ?? {}).length ? JSON.stringify(e.details) : "—"}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

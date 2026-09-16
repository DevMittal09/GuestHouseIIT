"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  flushMailOutbox,
  listMailOutbox,
  retryMailMessage,
  sendTestEmail,
  type MailOutboxSummary,
} from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { MAIL_EVENT_LABELS, MAIL_STATUSES, type MailStatus } from "@/lib/mail/types";
import { cn } from "@/lib/utils";

/**
 * The mail log.
 *
 * This is the screen you want at 11pm during the pilot, when the question is
 * "did the warden actually get told?" — and the answer has to be better than
 * reading the server's stdout. It shows the queue, what failed and why, and
 * lets a developer retry one message or flush the queue without a shell.
 *
 * Bodies are not shown: the server deliberately does not send them, because
 * the question here is delivery, and the content is the booking, which is a
 * click away in All Bookings.
 */

const STATUS_STYLES: Record<MailStatus, string> = {
  QUEUED: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  SENDING: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  SENT: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  FAILED: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
};

/** What each transport means, so the value in the header is not a riddle. */
const TRANSPORT_NOTES: Record<string, string> = {
  smtp: "Messages are being delivered over SMTP.",
  file: "No SMTP credentials are set, so each message is written to .local-mail/ as an .eml file instead of being sent.",
  "dry-run": "MAIL_DRY_RUN is set: messages are logged and nothing is sent, not even to disk.",
};

type Loaded = {
  rows: MailOutboxSummary[];
  counts: Record<MailStatus, number>;
  transport: string;
};

export function MailOutbox() {
  const [filter, setFilter] = useState<MailStatus | "all">("all");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isWorking, startWorking] = useTransition();

  const load = useCallback((status: MailStatus | "all") => {
    startLoading(async () => {
      const result = await listMailOutbox(status === "all" ? undefined : status);
      if (result.ok) {
        setData({ rows: result.rows, counts: result.counts, transport: result.transport });
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }, []);

  // Fetched client-side rather than server-rendered so the Refresh button and
  // the status filter do not reload the whole console.
  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const retry = (id: string) =>
    startWorking(async () => {
      const result = await retryMailMessage(id);
      if (result.ok) {
        toast.success("Message re-queued and sent");
        load(filter);
      } else {
        toast.error(result.error);
      }
    });

  const flush = () =>
    startWorking(async () => {
      const result = await flushMailOutbox();
      if (result.ok) {
        toast.success(
          result.sent === 0 && result.failed === 0
            ? "Nothing was waiting to be sent"
            : `${result.sent} sent, ${result.failed} failed`
        );
        load(filter);
      } else {
        toast.error(result.error);
      }
    });

  const test = () =>
    startWorking(async () => {
      const result = await sendTestEmail();
      if (result.ok) {
        toast.success("Test message sent — check the inbox it was addressed to");
        load(filter);
      } else {
        toast.error(result.error);
      }
    });

  const total = data ? MAIL_STATUSES.reduce((sum, s) => sum + data.counts[s], 0) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mail transport</CardTitle>
          <CardDescription>
            Notifications are queued by the action that causes them and sent by a worker, so a slow
            or broken mail host can never fail a booking or make a requester wait.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {data?.transport ?? "…"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {data ? (TRANSPORT_NOTES[data.transport] ?? "") : "Loading…"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={test} disabled={isWorking} variant="default">
              Send a test message
            </Button>
            <Button onClick={flush} disabled={isWorking} variant="outline">
              Send queued now
            </Button>
            <Button onClick={() => load(filter)} disabled={isLoading} variant="ghost">
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outbox</CardTitle>
          <CardDescription>
            Every message the portal has queued, newest first. Recipients are the real ones — a
            redirect set by MAIL_REDIRECT_ALL_TO is applied when the message is sent, not when it
            is queued, so this stays an honest record of who was meant to be told.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 w-fit">
            {(["all", ...MAIL_STATUSES] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === status
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {status === "all" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({status === "all" ? total : (data?.counts[status] ?? 0)})
                </span>
              </button>
            ))}
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          )}

          {data && data.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {total === 0
                ? "No mail has been queued yet. Submit or approve a booking and it will appear here."
                : "No messages with that status."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Queued</TableHead>
                    <TableHead className="text-right">Tries</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[row.status]}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {MAIL_EVENT_LABELS[row.event_key as keyof typeof MAIL_EVENT_LABELS] ??
                          row.event_key}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="break-all">{row.to_emails.join(", ")}</span>
                        {row.cc_emails.length > 0 && (
                          <span className="block text-xs text-muted-foreground break-all">
                            cc {row.cc_emails.join(", ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm">
                        <span className="block truncate" title={row.subject}>
                          {row.subject}
                        </span>
                        {row.last_error && (
                          <span className="mt-0.5 block text-xs text-red-700 dark:text-red-300">
                            {row.last_error}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.sent_at ?? row.created_at)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {row.attempts}
                      </TableCell>
                      <TableCell className="text-right">
                        {(row.status === "FAILED" || row.status === "QUEUED") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => retry(row.id)}
                          >
                            Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

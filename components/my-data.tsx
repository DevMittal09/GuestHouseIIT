"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { exportMyData, requestDataDeletion } from "@/app/actions/privacy";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

/**
 * A person's own data (Phase 8, DPDP): take a copy, or ask for it to be
 * erased. Erasure is a request the office answers, because the guest house
 * has to keep a record of who stayed.
 */
export function MyData({ openRequest }: { openRequest: { created_at: string } | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  const download = () =>
    startTransition(async () => {
      const result = await exportMyData();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data has been downloaded");
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
      <span>
        Your details are held as set out in the{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy notice
        </Link>
        .{" "}
        {openRequest
          ? `You asked for your data to be erased on ${formatDate(openRequest.created_at)}; the office will reply by email.`
          : "You can take a copy, or ask for it to be erased."}
      </span>
      <span className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={isPending} onClick={download}>
          Download my data
        </Button>
        {!openRequest && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => setAsking(true)}>
            Ask for erasure
          </Button>
        )}
      </span>

      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          setAsking(open);
          if (!open) setNote("");
        }}
        title="Ask for your data to be erased?"
        description="The guest house office answers each request. Records it must keep for audit — that a stay happened, when, and what it cost — cannot be erased, and the office will tell you what it kept and why."
        confirmLabel="Send the request"
        confirmVariant="default"
        pending={isPending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await requestDataDeletion(note);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Your request has been sent to the guest house office");
            setAsking(false);
            setNote("");
            router.refresh();
          })
        }
      >
        <Textarea
          aria-label="Anything you want the office to know"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything you want the office to know (optional)"
        />
      </ConfirmDialog>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { exportMyData, requestDataDeletion } from "@/app/actions/privacy";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

/**
 * A person's own data (Phase 8, DPDP): take a copy, or ask for it to be
 * erased. Erasure is a request the office answers, because the guest house
 * has to keep a record of who stayed.
 *
 * **A quiet line at the foot of My Bookings** (9 Oct 2026). It was a tinted
 * band with a rule down its left edge and a sentence about how details are
 * held, which made a standing legal right look like something that had just
 * happened to this booking. The rights are the same; what is left on screen
 * is the privacy notice and the two things a person can actually do. An open
 * erasure request still says so - that *is* news about their data.
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border pt-4 text-[13.5px] text-muted-foreground">
      <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
        Privacy notice
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={download}
        className="cursor-pointer underline underline-offset-4 hover:text-ink disabled:opacity-60"
      >
        Download my data
      </button>
      {openRequest ? (
        <span>
          Erasure requested {formatDate(openRequest.created_at)} - the office will reply by email.
        </span>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setAsking(true)}
          className="cursor-pointer underline underline-offset-4 hover:text-ink disabled:opacity-60"
        >
          Ask for erasure
        </button>
      )}

      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          setAsking(open);
          if (!open) setNote("");
        }}
        title="Ask for your data to be erased?"
        description="The guest house office answers each request. Records it must keep for audit - that a stay happened, when, and what it cost - cannot be erased, and the office will tell you what it kept and why."
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

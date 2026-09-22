"use client";

import type * as React from "react";

import { useState } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Confirmation for an action that cannot be undone.
 *
 * `window.confirm` was doing this job, and it is the wrong tool twice over: it
 * says nothing about what is actually about to be lost, and one stray Enter
 * accepts it. Deleting a guest house takes its rooms with it, so this spells
 * out the consequences and — when `confirmPhrase` is given — asks the operator
 * to type the name of the thing being destroyed. Typing "Bageshri" is hard to
 * do by accident; clicking OK is not.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmPhrase,
  confirmLabel = "Delete",
  pending = false,
  onConfirm,
  confirmVariant = "destructive",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** What this will take with it — one line each, shown as a list. */
  consequences?: string[];
  /** When set, the operator must type it exactly before confirming. */
  confirmPhrase?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  /** "default" for a weighty but not destructive step, like issuing an invoice. */
  confirmVariant?: "destructive" | "default";
  /** Extra fields the step needs, e.g. a reason. */
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const satisfied = !confirmPhrase || typed.trim() === confirmPhrase;

  // Clearing on close rather than on open keeps a half-typed phrase from
  // surviving into the next thing the operator opens.
  const change = (next: boolean) => {
    if (!next) setTyped("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {consequences && consequences.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {consequences.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="text-destructive">
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        {children}

        {confirmPhrase && (
          <div className="space-y-2">
            <Label htmlFor="confirm-phrase">
              Type <span className="font-mono font-semibold">{confirmPhrase}</span> to confirm
            </Label>
            <Input
              id="confirm-phrase"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            disabled={pending || !satisfied}
            onClick={onConfirm}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

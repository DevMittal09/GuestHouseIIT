"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeAdminPassword, lockAdminConsole } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConsoleAccess({ usingDefault }: { usingDefault: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLocking, startLocking] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("The two new passwords do not match");
      return;
    }
    startTransition(async () => {
      const result = await changeAdminPassword(current, next);
      if (result.ok) {
        setCurrent("");
        setNext("");
        setConfirm("");
        toast.success("Console password changed");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="max-w-xl space-y-6">
      {usingDefault && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The console is still on its default password (<strong>0000</strong>). Anyone who reaches
          this portal and picks the developer persona can guess it — set your own below.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Console password</CardTitle>
          <CardDescription>
            Guards the developer console only. Every admin action re-checks it, so it cannot be
            bypassed by calling the API directly — but it is not a login, and the portal still
            uses mock authentication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Repeat new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              At least 4 characters. Changing it signs out every other unlocked session.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              disabled={isPending || current === "" || next === "" || confirm === ""}
            >
              {isPending ? "Saving…" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lock the console</CardTitle>
          <CardDescription>
            Ends this unlock without switching persona. Useful before stepping away from a shared
            machine; the password is required to get back in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={isLocking}
            onClick={() =>
              startLocking(async () => {
                await lockAdminConsole();
                toast.success("Console locked");
                router.refresh();
              })
            }
          >
            {isLocking ? "Locking…" : "Lock now"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

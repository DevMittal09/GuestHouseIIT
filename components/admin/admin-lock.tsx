"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unlockAdminConsole } from "@/app/actions/admin";
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

/** Password prompt shown in place of the console until it is unlocked. */
export function AdminLock({ usingDefault }: { usingDefault: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await unlockAdminConsole(password);
      if (result.ok) {
        setPassword("");
        toast.success("Developer console unlocked");
        router.refresh();
      } else {
        setError(result.error);
        setPassword("");
      }
    });
  };

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Developer console is locked</CardTitle>
          <CardDescription>
            Enter the console password to manage users, guest houses, forms and bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="console-password">Console password</Label>
              <Input
                id="console-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            {usingDefault && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                This console is still on its default password (<strong>0000</strong>). Change it
                from Console Access once you are in.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isPending || password === ""}>
              {isPending ? "Checking…" : "Unlock console"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        This password only guards the developer console. It is not a substitute for signing in —
        the portal still uses mock authentication.
      </p>
    </div>
  );
}

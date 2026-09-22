"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logoutEverywhere } from "@/app/actions/auth";
import {
  beginMfaEnrolment,
  confirmMfaEnrolment,
  disableMfa,
  verifyMfa,
  type SessionSummary,
} from "@/app/actions/security";
import { SettingCard } from "@/components/admin/settings-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";
import type { MfaState } from "@/lib/auth";

/**
 * Security (Phase 8): the second factor for developer accounts, and the
 * sessions this account has open. The secret is shown once, at enrolment, and
 * the recovery codes once after it — neither can be read back afterwards.
 */
export function SecurityManager({
  mfa,
  sessions,
  idleMinutes,
  absoluteHours,
  stepUpMinutes,
}: {
  mfa: MfaState;
  sessions: SessionSummary[];
  idleMinutes: number;
  absoluteHours: number;
  stepUpMinutes: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enrolment, setEnrolment] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground">
          Your second factor and the browsers you are signed in on. A session ends after{" "}
          {idleMinutes} minutes of inactivity, and always after {absoluteHours} hours.
        </p>
      </div>

      {mfa.required && (
        <SettingCard
          title="Two-factor authentication"
          description={`Developer accounts can change roles, settings and delete records, so they carry a second factor. Dangerous changes ask for a fresh code if the last one is more than ${stepUpMinutes} minutes old.`}
        >
          {mfa.enrolled ? (
            <div className="space-y-3">
              <p className="text-sm">
                <Badge variant="secondary">On</Badge>{" "}
                {mfa.recent ? "Confirmed a moment ago." : "You will be asked for a code before dangerous changes."}
              </p>
              {!mfa.recent && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="mfa-verify">Authenticator code</Label>
                    <Input
                      id="mfa-verify"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="w-40 font-mono"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="123456"
                    />
                  </div>
                  <Button disabled={isPending || code.trim().length < 6} onClick={() => run(() => verifyMfa(code), "Confirmed", () => setCode(""))}>
                    Confirm
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" disabled={isPending} onClick={() => setConfirmDisable(true)}>
                Turn off
              </Button>
            </div>
          ) : enrolment ? (
            <div className="space-y-3">
              <p className="text-sm">
                Add this key to your authenticator app (Google Authenticator, Aegis, 1Password), then type the
                six-digit code it shows.
              </p>
              <p className="rounded-md border bg-muted/40 p-3 font-mono text-sm break-all">{enrolment.secret}</p>
              <p className="text-xs break-all text-muted-foreground">{enrolment.uri}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="mfa-code">Code from the app</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="w-40 font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                  />
                </div>
                <Button
                  disabled={isPending || code.trim().length < 6}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await confirmMfaEnrolment(code);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      setRecovery(result.recoveryCodes);
                      setEnrolment(null);
                      setCode("");
                      toast.success("Two-factor authentication is on");
                      router.refresh();
                    })
                  }
                >
                  Turn on
                </Button>
              </div>
            </div>
          ) : (
            <Button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await beginMfaEnrolment();
                  if (result.ok) setEnrolment({ secret: result.secret, uri: result.uri });
                  else toast.error(result.error);
                })
              }
            >
              Set up two-factor authentication
            </Button>
          )}

          {recovery && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-sm font-medium">Recovery codes — shown once</p>
              <p className="text-xs text-muted-foreground">
                Keep these somewhere safe and offline. Each works once, if you lose your phone.
              </p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
                {recovery.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Button size="sm" variant="outline" onClick={() => setRecovery(null)}>
                I have saved them
              </Button>
            </div>
          )}
        </SettingCard>
      )}

      <SettingCard
        title="Where you are signed in"
        description="Every browser with a live session on this account. Signing out everywhere ends all of them, including this one."
      >
        <ul className="divide-y rounded-md border text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="font-medium">
                  {s.current ? "This browser" : "Another browser"}
                  {s.current && (
                    <Badge variant="secondary" className="ml-2">
                      Current
                    </Badge>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.ip ?? "unknown address"} · {s.user_agent?.slice(0, 80) ?? "unknown browser"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Signed in {formatDateTime(s.created_at)} · last used {formatDateTime(s.last_seen_at)} · ends{" "}
                  {formatDateTime(s.absolute_expires_at)}
                </span>
              </span>
            </li>
          ))}
          {sessions.length === 0 && <li className="p-3 text-muted-foreground">No live sessions.</li>}
        </ul>
        <div className="flex justify-end">
          <Button variant="destructive" size="sm" disabled={isPending} onClick={() => setConfirmEverywhere(true)}>
            Sign out everywhere
          </Button>
        </div>
      </SettingCard>

      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title="Turn off two-factor authentication?"
        description="Your account would then be protected by the directory password alone. Enter a current code to confirm."
        confirmLabel="Turn off"
        pending={isPending}
        onConfirm={() => run(() => disableMfa(code), "Two-factor authentication is off", () => {
          setConfirmDisable(false);
          setCode("");
        })}
      >
        <Input
          aria-label="Authenticator code"
          inputMode="numeric"
          className="font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmEverywhere}
        onOpenChange={setConfirmEverywhere}
        title="Sign out of every browser?"
        description="Every session on this account ends, including this one. You will be asked to sign in again."
        confirmLabel="Sign out everywhere"
        pending={isPending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await logoutEverywhere();
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(`Signed out of ${result.sessions ?? 0} session(s)`);
            router.push("/sign-in");
          })
        }
      />
    </section>
  );
}

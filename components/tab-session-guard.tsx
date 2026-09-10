"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button } from "@/components/ui/button";

/**
 * Per-tab record of who this tab believes it is signed in as. `sessionStorage`
 * is per-tab (a duplicated tab starts with a copy, a new tab starts empty),
 * which is exactly the granularity the cookie does not have.
 */
const TAB_KEY = "gh_tab_session";

interface Claim {
  id: string;
  name: string;
}

// --- a tiny external store over sessionStorage -----------------------------
// `useSyncExternalStore` rather than `useState` + an effect: reading storage
// during render is impure and setting state inside an effect body is what the
// React Compiler lint rejects. Snapshots are the raw string, so React's
// value comparison is enough to decide when to re-render.

let listeners: (() => void)[] = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function readClaim(): string {
  try {
    return sessionStorage.getItem(TAB_KEY) ?? "";
  } catch {
    // Private mode / blocked site data. No claim means no conflict, which
    // degrades to exactly the old behaviour.
    return "";
  }
}

function writeClaim(claim: Claim) {
  try {
    sessionStorage.setItem(TAB_KEY, JSON.stringify(claim));
  } catch {
    // Nothing to do — the guard simply does not engage in this browser.
  }
  emit();
}

function parseClaim(raw: string): Claim | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Claim>;
    return parsed.id ? { id: parsed.id, name: parsed.name ?? "another user" } : null;
  } catch {
    return null;
  }
}

/**
 * Stops one tab silently turning into a different user's session.
 *
 * The mock sign-in is a cookie, and a cookie belongs to the whole browser, not
 * to a tab. So signing in as someone else in a duplicated tab changes who
 * *every* open tab is — and because the portal polls every 5 s, the other tabs
 * would quietly re-render as the new persona mid-task, which reads as the app
 * corrupting itself.
 *
 * A tab claims its identity in `sessionStorage` on first render. If the
 * server-rendered user later disagrees with that claim, this blocks the tab
 * and says so, and — importantly — stops the polling so the stale view holds
 * still instead of morphing under the reader.
 *
 * This does not give each tab its own session; a cookie cannot do that. Real
 * per-tab sessions arrive with real authentication (roadmap item 1), where the
 * session token can live in the tab. Until then, a second identity needs a
 * second browser profile or a private window.
 */
export function TabSessionGuard({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const raw = useSyncExternalStore(subscribe, readClaim, () => "");
  const claim = parseClaim(raw);
  const conflict = claim && claim.id !== userId ? claim : null;

  useEffect(() => {
    // Leave a standing conflict alone: overwriting it here would re-claim the
    // tab for the new user and the warning would never appear.
    if (conflict) return;
    const next = JSON.stringify({ id: userId, name: userName });
    if (raw === next) return;
    writeClaim({ id: userId, name: userName });
  }, [conflict, raw, userId, userName]);

  if (!conflict) return <AutoRefresh />;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tab-session-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-background p-6 shadow-lg">
        <div className="space-y-2">
          <h2 id="tab-session-title" className="text-lg font-semibold">
            This browser switched user
          </h2>
          <p className="text-sm text-muted-foreground">
            This tab was signed in as{" "}
            <span className="font-medium text-foreground">{conflict.name}</span>, but the browser
            is now signed in as{" "}
            <span className="font-medium text-foreground">{userName}</span> — a sign-in applies to
            every tab, not just the one you used.
          </p>
          <p className="text-sm text-muted-foreground">
            Nothing here has been saved or changed. This tab has stopped refreshing so it does not
            keep updating as someone else. To use two accounts at once, open the second one in a
            private window.
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => writeClaim({ id: userId, name: userName })}>
            Continue as {userName}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Routes where polling is more harmful than useful: the approval log is
 * historical data behind a search, so re-fetching it every few seconds only
 * re-runs a full archive scan and churns the results under the reader. The
 * availability grid fetches its own data client-side and has a Refresh button,
 * so a server refresh would do nothing but work.
 */
const NO_POLL_PREFIXES = ["/history", "/availability"];

/**
 * Poll-based "realtime": re-fetches server data so reviewer queues and
 * statuses stay current. With Supabase configured this could be replaced by
 * a postgres_changes subscription.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const paused = NO_POLL_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs, paused]);
  return null;
}

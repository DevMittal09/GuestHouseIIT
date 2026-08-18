"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Poll-based "realtime": re-fetches server data so reviewer queues and
 * statuses stay current. With Supabase configured this could be replaced by
 * a postgres_changes subscription.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}

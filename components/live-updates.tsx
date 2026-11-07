"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeping a desk's screen current (Phase 9).
 *
 * Polls the server every 30 seconds and refreshes when the tab is brought
 * back to the front, which is when it matters most.
 */

/** Routes that fetch their own data, or that a refresh would disturb. */
const NO_REFRESH_PREFIXES = ["/history", "/availability", "/admin/mail", "/admin/audit"];

/** The polling interval. */
const FALLBACK_MS = 30_000;

export function LiveUpdates() {
  const router = useRouter();
  const pathname = usePathname();
  const paused = NO_REFRESH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), 400);
    };
    document.addEventListener("visibilitychange", refresh);

    const id = setInterval(refresh, FALLBACK_MS);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      if (pending.current) clearTimeout(pending.current);
    };
  }, [router, paused]);

  return null;
}

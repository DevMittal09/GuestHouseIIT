"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeping a desk's screen current (Phase 9).
 *
 * With Supabase configured the browser subscribes to `postgres_changes` on the
 * tables a queue actually depends on — bookings, room holds and blocks — and
 * re-fetches when one of them changes. That is a websocket held open, instead
 * of a full server render every five seconds whether or not anything happened:
 * a reception screen left open all day made ~17,000 requests, and now makes
 * one subscription.
 *
 * Without Supabase (the mock store, a developer's machine) there is nothing to
 * subscribe to, so it falls back to polling — but every 30 seconds, not every
 * five. A refresh is also triggered whenever the tab is brought back to the
 * front, which is when it matters most.
 */

/** Routes that fetch their own data, or that a refresh would disturb. */
const NO_REFRESH_PREFIXES = ["/history", "/availability", "/admin/mail", "/admin/audit"];

/** The mock store's fallback interval. Realtime replaces it entirely. */
const FALLBACK_MS = 30_000;

export function LiveUpdates({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const paused = NO_REFRESH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  // A burst of changes (a booking, its holds, its logs) is one refresh.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), 400);
    };
    document.addEventListener("visibilitychange", refresh);

    let cleanup: (() => void) | undefined;
    if (supabaseUrl && supabaseAnonKey) {
      let cancelled = false;
      // Loaded on demand: a requester who never opens a desk page should not
      // pay for the realtime client.
      import("@supabase/supabase-js").then(({ createClient }) => {
        if (cancelled) return;
        const client = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
          realtime: { params: { eventsPerSecond: 2 } },
        });
        const channel = client.channel("guesthouse-desk");
        for (const table of ["bookings", "room_holds", "room_blocks", "invoices"]) {
          channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
        }
        channel.subscribe();
        cleanup = () => {
          client.removeChannel(channel);
        };
      });
      return () => {
        cancelled = true;
        cleanup?.();
        document.removeEventListener("visibilitychange", refresh);
        if (pending.current) clearTimeout(pending.current);
      };
    }

    const id = setInterval(refresh, FALLBACK_MS);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      if (pending.current) clearTimeout(pending.current);
    };
  }, [router, paused, supabaseUrl, supabaseAnonKey]);

  return null;
}

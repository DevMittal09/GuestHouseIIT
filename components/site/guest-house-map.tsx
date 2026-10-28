"use client";

import { useId, useRef, useState } from "react";
import { MapEmbed } from "@/components/site/site-ui";
import type { MapPin } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The Contact page's map: one tab per guest house (`guestHouseMapPins`) and
 * the chosen one embedded. A WAI-ARIA tab list - arrow keys, Home and End
 * move between guest houses - so it works from the keyboard as well as by
 * pointer. With a single pin there is nothing to choose, and no tab list is
 * drawn.
 *
 * **The row under the map is gone** (27 Oct 2026): it reprinted the name of
 * the tab directly above it, and offered "Open in Google Maps" and "Get
 * directions" - both of which the embed itself carries. The footer still
 * links each guest house's map and directions, for a reader who never reaches
 * this page.
 */
export function GuestHouseMap({ pins }: { pins: MapPin[] }) {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const pin = pins[selected] ?? pins[0];
  if (!pin) return null;

  const choose = (index: number) => {
    const next = (index + pins.length) % pins.length;
    setSelected(next);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") choose(selected + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") choose(selected - 1);
    else if (e.key === "Home") choose(0);
    else if (e.key === "End") choose(pins.length - 1);
    else return;
    e.preventDefault();
  };

  const panelId = `${id}-panel`;

  return (
    <div className="min-w-0 overflow-hidden rounded-[8px] border border-border bg-white">
      {pins.length > 1 && (
        <div
          role="tablist"
          aria-label="Guest house"
          onKeyDown={onKeyDown}
          className="grid border-b border-border"
          style={{ gridTemplateColumns: `repeat(${pins.length}, minmax(0, 1fr))` }}
        >
          {pins.map((p, i) => {
            const active = i === selected;
            return (
              <button
                key={p.slug}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                id={`${id}-tab-${p.slug}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={panelId}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelected(i)}
                className={cn(
                  "relative cursor-pointer px-4 py-4 text-left font-heading text-[clamp(18px,2vw,22px)] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion",
                  i > 0 && "border-l border-border",
                  active ? "bg-white text-ink" : "bg-band text-muted-foreground hover:text-ink"
                )}
              >
                {p.name}
                {active && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-vermilion" />}
              </button>
            );
          })}
        </div>
      )}

      <div
        id={panelId}
        role={pins.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={pins.length > 1 ? `${id}-tab-${pin.slug}` : undefined}
      >
        <MapEmbed key={pin.slug} pin={pin} className="h-[clamp(300px,58vw,460px)]" />
      </div>
    </div>
  );
}

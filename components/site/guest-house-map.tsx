"use client";

import { useId, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { MapPin } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The Contact page's map: one tab per guest house (`guestHouseMapPins`), the
 * chosen one embedded, and its "Open in Google Maps" / "Get directions" links
 * underneath. A WAI-ARIA tab list — arrow keys, Home and End move between
 * guest houses — so it works from the keyboard as well as by pointer. With a
 * single pin there is nothing to choose, and no tab list is drawn.
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
        <iframe
          key={pin.slug}
          title={`${pin.name} on the map`}
          src={pin.embedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-[clamp(300px,58vw,460px)] w-full border-0 bg-band"
        />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border px-4 py-3.5 text-[15px]">
          <span className="font-semibold text-ink">{pin.name}</span>
          <span className="flex flex-wrap gap-x-6 gap-y-2">
            <MapLink href={pin.openUrl}>Open in Google Maps</MapLink>
            <MapLink href={pin.directionsUrl}>Get directions</MapLink>
          </span>
        </div>
      </div>
    </div>
  );
}

function MapLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[5px] hover:text-vermilion-deep"
    >
      {children}
      <ArrowUpRight aria-hidden className="size-4" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitePhoto } from "@/lib/site";

/**
 * The home page's slideshow (15 Oct 2026, the owner: "i need images which
 * change evry few seconds and has the option of arrows to move to next
 * image... just go to iitpkd.ac.in website and see what i mean").
 *
 * **The one client component on the public site.** Everything else there is a
 * server component; this needs a timer and state, so it is marked and kept as
 * small as possible - it takes photographs and renders them, and knows
 * nothing about guest houses.
 *
 * Modelled on iitpkd.ac.in's own hero: five banner photographs, **Previous /
 * Pause / Next**, and **numbered** indicators rather than dots. The numbers
 * are theirs and they suit this codebase - a row of round dots would be the
 * pills the design rules ban, and a number says how far through you are
 * without a legend.
 *
 * What was not copied: their slides are wrapped in links to other pages, and
 * these are not. A photograph here is a photograph; the site's rule that no
 * photograph carries a visible caption holds inside the slideshow too, so a
 * slide says nothing and the guest houses are named in the cards below it.
 *
 * Four rules an auto-rotating carousel has to keep, all of them here:
 *
 * - **It stops.** A visible Pause button, and it also holds while a pointer
 *   is over it or the keyboard focus is inside it, so nobody loses the
 *   photograph they were looking at or the control they were tabbing to.
 * - **`prefers-reduced-motion` turns the rotation off**, not just the
 *   transition. Movement a reader did not ask for is the thing that setting
 *   is about.
 * - **`aria-live` follows the rotation**: "off" while it advances by itself
 *   (a screen reader must not narrate a timer), "polite" the moment it is
 *   paused and the reader is driving.
 * - **Every slide stays mounted** and the inactive ones are `aria-hidden`,
 *   so the track can slide and nothing off-screen is announced or focusable.
 */

/** How long each photograph is held. Long enough to look at a building. */
const ADVANCE_MS = 6000;

const CONTROL =
  "grid size-11 shrink-0 place-items-center rounded-md border border-border-strong bg-white text-ink " +
  "transition-colors hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[var(--ring)]";

export function HeroCarousel({ photos }: { photos: SitePhoto[] }) {
  const count = photos.length;
  const [index, setIndex] = useState(0);
  /** The Pause button. */
  const [playing, setPlaying] = useState(true);
  /** A pointer is over it, or the focus is inside it. */
  const [held, setHeld] = useState(false);

  const show = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  );

  const rotating = playing && !held && count > 1;

  useEffect(() => {
    if (!rotating) return;
    // Not just the transition: the rotation itself stops.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [rotating, count]);

  if (count === 0) return null;

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Photographs of the guest houses"
      className="overflow-hidden rounded-lg border border-border-strong bg-white"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div className="relative">
        <div className="overflow-hidden">
          {/* One track, translated. The arrows imply sideways movement, so
              the photographs move sideways; a crossfade would not match
              the control. */}
          <div
            aria-live={rotating ? "off" : "polite"}
            className="flex transition-transform duration-700 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {photos.map((photo, i) => (
              <div
                key={photo.src ?? photo.alt}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={i !== index}
                // 4:3 on a phone shows more of a building than a letterbox
                // does; 16:9 from `sm` is the banner shape.
                className="relative aspect-[4/3] w-full shrink-0 bg-band sm:aspect-[16/9]"
              >
                {photo.src && (
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 1280px) 1160px, 100vw"
                    // The first carries the page's largest paint. The rest
                    // are eager deliberately: they sit inside `overflow-hidden`
                    // and translated off to the side, where lazy loading
                    // cannot be relied on to have fetched them before the
                    // timer brings them round.
                    priority={i === 0}
                    loading={i === 0 ? undefined : "eager"}
                    className="object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => show(index - 1)}
              aria-label="Previous photograph"
              className={cn(CONTROL, "absolute top-1/2 left-3 -translate-y-1/2 sm:left-4")}
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => show(index + 1)}
              aria-label="Next photograph"
              className={cn(CONTROL, "absolute top-1/2 right-3 -translate-y-1/2 sm:right-4")}
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-strong px-3 py-2 sm:px-4">
          {/* Numbered, as iitpkd.ac.in has them. The bar under each number is
              the page's own hairline vocabulary rather than a dot. */}
          <ul className="flex min-w-0 flex-wrap items-center">
            {photos.map((photo, i) => (
              <li key={photo.src ?? photo.alt}>
                <button
                  type="button"
                  onClick={() => show(i)}
                  aria-label={`Photograph ${i + 1} of ${count}`}
                  aria-current={i === index ? "true" : undefined}
                  className="group block px-2 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  <span
                    className={cn(
                      "block text-meta font-semibold tabular-nums transition-colors",
                      i === index ? "text-ink" : "text-muted-foreground group-hover:text-ink"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 block h-[3px] w-full transition-colors",
                      i === index ? "bg-vermilion" : "bg-border-strong group-hover:bg-ink"
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPlaying((on) => !on)}
            aria-label={playing ? "Pause the slideshow" : "Play the slideshow"}
            className={cn(CONTROL, "size-9")}
          >
            {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

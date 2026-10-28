"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SitePhoto } from "@/lib/site";

/**
 * The home page's hero: the photograph **fills the first viewport**, a
 * translucent ink wash over it, and the page's title set in the middle of it
 * (27 Oct 2026, the owner: "a cinematic photograph with the text naturally
 * integrated into it, rather than a conventional website banner").
 *
 * **The one client component on the public site.** Everything else there is a
 * server component; this needs a timer, a pointer and state, so it is marked
 * and kept as small as possible - it takes photographs and whatever belongs
 * over them, and knows nothing about guest houses, the store or any booking
 * rule. The title, the lead and the two doors are the page's own server-
 * rendered markup, passed in as `children`.
 *
 * It reverses two older decisions, each asked for outright:
 *
 * - **A photograph may now be full-bleed.** Photographs were contained in the
 *   layout from 26 Sep 2026, when a full-screen one read as "so weird" to the
 *   owner. This one is asked for by the brief, is the only one on the site,
 *   and carries the page's title - which is what it was missing in September.
 * - **There are no visible controls.** The slideshow of 15 Oct 2026 had
 *   iitpkd.ac.in's Previous / Pause / Next and numbered indicators; the brief
 *   removes the numbering and the pause button and makes **the photograph
 *   itself** the pause control. With two slides and no arrows there is nothing
 *   for a number to count.
 *
 * What survives of the four rules a rotating carousel has to keep:
 *
 * - **It stops.** The whole photograph is one labelled `<button>` that toggles
 *   the rotation, so it is operable and announced from the keyboard as well as
 *   under a pointer, and a small "Paused" marker says so on screen. It no
 *   longer holds on hover - hovering is now the zoom, and on a hero this size
 *   the pointer rests over it most of the time, which would stop the
 *   rotation the brief asks for. Keyboard focus inside it still holds it.
 * - **`prefers-reduced-motion` stops the rotation itself**, the drift and the
 *   pointer zoom - not just the transition between slides.
 * - **`aria-live` follows the rotation**: "off" while it advances by itself (a
 *   screen reader must not narrate a timer), "polite" once it is paused and
 *   the reader is driving.
 * - **Every slide stays mounted**, the inactive ones `aria-hidden`, so the
 *   two can cross-fade and nothing underneath is announced.
 */

/** How long each photograph is held. Long enough to look at a building. */
const ADVANCE_MS = 6500;

/** The cross-fade, and the pointer zoom. Slow on purpose: this is the one
 *  place on the site where something moves without being asked. */
const FADE_MS = 1400;

export function HeroCarousel({
  photos,
  children,
}: {
  photos: SitePhoto[];
  /** The title, the lead and the two doors - set over the photograph. */
  children: React.ReactNode;
}) {
  const count = photos.length;
  const [index, setIndex] = useState(0);
  /** The photograph was clicked. */
  const [paused, setPaused] = useState(false);
  /** The keyboard focus is inside the hero. */
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);
  /**
   * The layer the pointer moves. Written through the ref rather than through
   * state: a pointer move is one style on one element, and re-rendering six
   * layers at the frame rate to say so would be the expensive way to do it.
   */
  const lens = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setStill(quiet.matches);
    read();
    quiet.addEventListener("change", read);
    return () => quiet.removeEventListener("change", read);
  }, []);

  const rotating = !paused && !held && !still && count > 1;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [rotating, count]);

  /**
   * The photograph eases towards whatever the pointer is over: the origin
   * follows the pointer and the scale lifts a little, both through one slow
   * transition, so it reads as a camera moving rather than as a hover effect.
   * Touch is left alone - there is no hover to answer, and a tap is the pause.
   */
  const follow = (e: React.PointerEvent<HTMLElement>) => {
    const layer = lens.current;
    if (!layer || still || e.pointerType !== "mouse") return;
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    layer.style.transformOrigin = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
    layer.style.transform = "scale(1.06)";
  };

  /** Back out from where it was, so the move reverses rather than jumping. */
  const release = () => {
    const layer = lens.current;
    if (layer) layer.style.transform = "scale(1)";
  };

  if (count === 0) return null;

  return (
    <section
      className="relative isolate flex min-h-svh flex-col justify-center overflow-hidden bg-ink"
      onPointerMove={follow}
      onPointerLeave={release}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Photographs of the guest houses"
        aria-live={rotating ? "off" : "polite"}
        className="absolute inset-0"
      >
        <div
          ref={lens}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          className="absolute inset-0 transition-[transform,transform-origin] ease-out will-change-transform motion-reduce:transition-none"
        >
          <div className="absolute inset-0 motion-safe:animate-[hero-drift_30s_ease-in-out_infinite_alternate]">
            {photos.map((photo, i) => (
              <div
                key={photo.src ?? photo.alt}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={i !== index}
                style={{ transitionDuration: `${FADE_MS}ms` }}
                className={cn(
                  "absolute inset-0 transition-opacity ease-in-out motion-reduce:transition-none",
                  i === index ? "opacity-100" : "opacity-0"
                )}
              >
                {photo.src && (
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="100vw"
                    // The first is the page's largest paint. The second is
                    // eager deliberately: it is stacked behind the first at
                    // zero opacity, where lazy loading cannot be relied on to
                    // have fetched it before the fade begins, and a blank
                    // frame mid-fade is worse than the bytes.
                    priority={i === 0}
                    loading={i === 0 ? undefined : "eager"}
                    className="object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        {/*
          The wash: one translucent solid colour, the institute's own charcoal,
          and no gradient - the brief asks for the photograph to stay clearly
          visible through it, and the site bans gradients anyway.

          **66% since 27 Oct 2026**, up from 60: the owner found the type over
          the photographs short of prominence, and the answer is the wash and
          the type, not a drop shadow behind the letters, which this project
          bans everywhere and which is the thing that makes a hero look
          cheap. White display type now clears 3.6:1 against the brightest
          tenth of the middle of either photograph and 7.6:1 against its
          average, and the architecture still reads through.
        */}
        <div aria-hidden className="absolute inset-0 bg-ink/66" />
      </div>

      {/*
        Clicking the photograph pauses it, clicking again resumes - the brief's
        replacement for the pause button. It is a real `<button>` covering the
        photograph so it is reachable and announced, under the title block
        rather than over it, and the title block passes clicks through to it.
      */}
      <button
        type="button"
        onClick={() => setPaused((on) => !on)}
        aria-label={paused ? "Resume the photographs" : "Pause the photographs"}
        className="absolute inset-0 z-10 cursor-default focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
      />

      {/*
        `pointer-events-none` so a click anywhere but the two doors reaches the
        button underneath: everything a reader would call "the hero image" has
        to answer the same way.
      */}
      <div className="pointer-events-none relative z-20 mx-auto w-full max-w-[1240px] px-[clamp(16px,4vw,40px)] py-[clamp(96px,16vh,176px)]">
        {children}
      </div>

      {paused && (
        <p className="absolute right-[clamp(16px,4vw,40px)] bottom-6 z-20 text-meta font-semibold tracking-[0.18em] text-white/70 uppercase">
          Paused
        </p>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import type { SitePhoto } from "@/lib/site";
import { cn } from "@/lib/utils";

type Section = { title: string; qualifier: string; photos: SitePhoto[] };

/**
 * The gallery's photo grids and a full-screen viewer. Each tile is still a
 * plain link to the full-size file, so without JavaScript it opens the photo
 * as before; with it, the click opens the viewer instead, which steps through
 * every photo on the page with the arrow keys or buttons.
 */
export function GalleryGrid({ sections }: { sections: Section[] }) {
  const all = sections.flatMap((s) => s.photos.filter((p) => p.src));
  const [index, setIndex] = useState<number | null>(null);
  const current = index === null ? null : all[index];

  const step = (delta: number) =>
    setIndex((i) => (i === null ? i : (i + delta + all.length) % all.length));

  return (
    <>
      {sections.map((section, s) => (
        <section
          key={section.title}
          aria-labelledby={`gallery-${s}`}
          className={cn("reveal", s < sections.length - 1 && "mb-[clamp(56px,8vw,96px)]")}
        >
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11.5px] font-bold tracking-[0.18em] text-vermilion-deep uppercase">
                {section.qualifier}
              </p>
              <h2 id={`gallery-${s}`} className="mt-2 text-[clamp(28px,3.4vw,40px)] font-semibold text-foreground">
                {section.title}
              </h2>
            </div>
            <span className="text-[13.5px] font-medium text-muted-foreground">
              {section.photos.length} photograph{section.photos.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="grid auto-rows-[clamp(150px,19vw,240px)] grid-cols-2 gap-3 [grid-auto-flow:dense] md:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {section.photos.map((photo, i) => {
              const at = all.indexOf(photo);
              const feature = i === 0 && !photo.portrait;
              return (
                <li
                  key={photo.alt}
                  className={cn(
                    "min-w-0",
                    feature && "col-span-2 row-span-2",
                    photo.portrait && "row-span-2"
                  )}
                >
                  {photo.src ? (
                    <a
                      href={photo.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || at < 0) return;
                        e.preventDefault();
                        setIndex(at);
                      }}
                      className="group relative block size-full overflow-hidden rounded-3xl bg-band"
                    >
                      <Image
                        src={photo.src}
                        alt={photo.alt}
                        fill
                        sizes={feature ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                      />
                      <span
                        aria-hidden
                        className="absolute inset-x-3 bottom-3 flex translate-y-2 items-center justify-between gap-2 text-[13px] font-semibold text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
                      >
                        <span className="truncate">{photo.alt}</span>
                        <Expand className="size-4 shrink-0" />
                      </span>
                      <span className="sr-only">(opens the full-size photograph)</span>
                    </a>
                  ) : (
                    <div
                      role="img"
                      aria-label={`${photo.alt} (photograph to follow)`}
                      className="flex size-full items-center justify-center rounded-3xl border border-dashed border-border-strong bg-band p-3 text-center text-sm text-muted-foreground"
                    >
                      {photo.alt}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <DialogPrimitive.Root open={current !== null} onOpenChange={(open) => !open && setIndex(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") step(1);
              if (e.key === "ArrowLeft") step(-1);
            }}
            className="fixed inset-0 z-50 flex flex-col outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <div className="flex items-center justify-between gap-4 px-[clamp(12px,3vw,32px)] py-4 text-white">
              <DialogPrimitive.Title className="min-w-0 truncate font-heading text-lg font-semibold">
                {current?.alt}
              </DialogPrimitive.Title>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[13px] font-semibold text-white/60 tabular-nums">
                  {index !== null ? index + 1 : 0} / {all.length}
                </span>
                <DialogPrimitive.Close className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                  <X aria-hidden className="size-5" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              {current?.src && (
                <Image
                  key={current.src}
                  src={current.src}
                  alt={current.alt}
                  fill
                  sizes="100vw"
                  className="object-contain px-[clamp(8px,6vw,96px)] pb-6 animate-in fade-in-0 duration-300"
                />
              )}
              {all.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="absolute top-1/2 left-[clamp(8px,2vw,24px)] inline-flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/25"
                  >
                    <ChevronLeft aria-hidden className="size-6" />
                    <span className="sr-only">Previous photograph</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="absolute top-1/2 right-[clamp(8px,2vw,24px)] inline-flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/25"
                  >
                    <ChevronRight aria-hidden className="size-6" />
                    <span className="sr-only">Next photograph</span>
                  </button>
                </>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

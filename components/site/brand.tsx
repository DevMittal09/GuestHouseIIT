import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The guest house's lockup: the institute's emblem beside "Guest House" in the
 * serif, with a small tracked line underneath.
 *
 * It uses the **emblem alone** (`public/iitpkd-logo.png`) and sets the words in
 * type. The stacked logo file carries "IIT PALAKKAD" under the emblem, which
 * at header size came out about 8px tall — the reason the old header looked
 * cheap. `tone="light"` is for a header lying over a photograph.
 */
export function BrandBlock({
  href = "/",
  tagline = "IIT Palakkad",
  tone = "dark",
  compact = false,
}: {
  href?: string;
  /** The small line under "Guest House". */
  tagline?: string;
  tone?: "dark" | "light";
  /** The portal's working header: a little smaller. */
  compact?: boolean;
}) {
  const light = tone === "light";
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-[clamp(10px,1.4vw,14px)] no-underline"
    >
      <Image
        src="/iitpkd-logo.png"
        alt="IIT Palakkad"
        // Drawn at 40–48px; declaring that size makes next/image send a
        // small copy rather than the 397px file.
        width={48}
        height={48}
        priority
        className={cn("shrink-0", compact ? "size-10" : "size-[clamp(40px,4.4vw,48px)]")}
      />
      <span className="block min-w-0">
        <span
          className={cn(
            "block font-heading leading-none font-semibold tracking-[-0.01em] whitespace-nowrap",
            compact ? "text-[22px]" : "text-[clamp(22px,2.3vw,27px)]",
            light ? "text-white" : "text-ink"
          )}
        >
          Guest House
        </span>
        <span
          className={cn(
            "mt-[7px] block truncate text-[10.5px] leading-none font-semibold tracking-[0.24em] uppercase",
            light ? "text-white/80" : "text-vermilion-deep"
          )}
        >
          {tagline}
        </span>
      </span>
    </Link>
  );
}

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The guest house's lockup: the institute's emblem, a hairline, then "Guest
 * House" in Source Serif 4 over a tracked "IIT PALAKKAD" line.
 *
 * It uses the **emblem alone** (`public/iitpkd-logo.png`) and sets the words in
 * type. The stacked logo file carries "IIT PALAKKAD" under the emblem, which
 * at header size came out about 8px tall - the reason the old header looked
 * cheap. The hairline between emblem and words is the institutional lockup's
 * habit (30 Sep 2026): it makes the two read as one mark rather than a
 * picture beside a heading. `tone="light"` is for the ink footer.
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
      className="group flex min-w-0 items-center gap-[clamp(10px,1.3vw,14px)] no-underline"
    >
      <Image
        src="/iitpkd-logo.png"
        alt="IIT Palakkad"
        // Drawn at 40–50px; declaring that size makes next/image send a
        // small copy rather than the 397px file.
        width={50}
        height={50}
        priority
        className={cn("shrink-0", compact ? "size-10" : "size-[clamp(42px,4.4vw,50px)]")}
      />
      <span
        aria-hidden
        className={cn(
          "w-px shrink-0 self-stretch",
          compact ? "my-1" : "my-0.5",
          light ? "bg-white/25" : "bg-border-strong"
        )}
      />
      <span className="block min-w-0">
        <span
          className={cn(
            "block font-heading leading-none font-semibold tracking-[-0.012em] whitespace-nowrap",
            compact ? "text-[22px]" : "text-[clamp(23px,2.3vw,28px)]",
            light ? "text-white" : "text-ink"
          )}
        >
          Guest House
        </span>
        <span
          className={cn(
            "mt-[7px] block truncate text-[10.5px] leading-none font-semibold tracking-[0.26em] uppercase",
            light ? "text-saffron" : "text-vermilion-deep"
          )}
        >
          {tagline}
        </span>
      </span>
    </Link>
  );
}

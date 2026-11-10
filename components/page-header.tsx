import { cn } from "@/lib/utils";

/**
 * The title block at the top of every portal page.
 *
 * **No rule under it** (27 Oct 2026, the owner: "remove the default
 * horizontal lines or underlines beneath page and section headings - use more
 * refined alternatives"). It closed on the vermilion hairline iitpkd.ac.in
 * puts under `h1.node-title` from 11 Oct 2026, which was the institute's own
 * device but still a line across the page under every heading in the service.
 * What ranks the title now is the type and the space: a small tracked label
 * above it, the serif at display size, and a clear gap before the page
 * begins.
 *
 * The caption is the one thing the title cannot say: which guest house, whose
 * queue, which slice of the archive.
 */
export function PageHeader({
  title,
  caption,
  captionClass,
  children,
  actions,
}: {
  title: React.ReactNode;
  /** A short label over the title - the desk, the queue, the section. */
  caption?: React.ReactNode;
  /**
   * Colour for the caption, in place of the default vermilion - the guest
   * house's own, on the desk's console (10 Nov 2026,
   * `lib/guest-house-accent.ts`). The caption is where it belongs: it is
   * already the line that says *which* guest house, and colouring it adds no
   * rule and no new element to a heading the owner asked to keep clean.
   */
  captionClass?: string;
  /** The description paragraph. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        {caption && (
          <p
            className={cn(
              "mb-2.5 text-[11.5px] font-semibold tracking-[0.18em] uppercase",
              captionClass ?? "text-vermilion-deep"
            )}
          >
            {caption}
          </p>
        )}
        <h1 className="text-display font-semibold text-ink">{title}</h1>
        {children && (
          <p className="mt-3 max-w-[70ch] text-[15.5px] leading-relaxed text-body">{children}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

/**
 * The title block at the top of every portal page.
 *
 * Redrawn 11 Oct 2026 on the institute's own device: the title closes on the
 * vermilion hairline iitpkd.ac.in puts under `h1.node-title`, with a heavier
 * stub over its start (`rule-title`). It replaced a 2px ink rule, which was
 * the same mark the tables already use for their header row - so a page and a
 * table opened identically and neither outranked the other.
 *
 * The caption above the title is the one thing the title cannot say: which
 * guest house, whose queue, which slice of the archive. It is set as a small
 * tracked label rather than a grey sentence.
 */
export function PageHeader({
  title,
  caption,
  children,
  actions,
}: {
  title: React.ReactNode;
  /** A short label over the title - the desk, the queue, the section. */
  caption?: React.ReactNode;
  /** The description paragraph. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rule-title flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-5">
      <div className="min-w-0">
        {caption && (
          <p className="mb-2.5 text-[11.5px] font-semibold tracking-[0.18em] text-vermilion-deep uppercase">
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

/**
 * The title block at the top of every portal page (30 Sep 2026): a short
 * vermilion rule, the page's one serif `<h1>`, a line on what the page is
 * for, and `actions` at the far end on wide screens (wrapping underneath on
 * narrow ones). A hairline closes the block, so the page's working content
 * starts on a clean edge.
 */
export function PageHeader({
  title,
  children,
  actions,
}: {
  title: React.ReactNode;
  /** The description paragraph. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-border pb-6">
      <div className="min-w-0">
        <div aria-hidden className="mb-4 h-[3px] w-9 bg-vermilion" />
        <h1 className="text-[clamp(28px,3.4vw,38px)] leading-[1.08] font-semibold tracking-[-0.015em] text-ink">
          {title}
        </h1>
        {children && (
          <p className="mt-2.5 max-w-[75ch] text-[15px] leading-relaxed text-body">{children}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

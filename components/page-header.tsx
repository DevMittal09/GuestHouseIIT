/**
 * The title block at the top of every portal page (30 Sep 2026), after
 * GOV.UK's: an optional grey caption naming where you are, the page's one
 * serif `<h1>` at display size, a lead, and `actions` at the far end on wide
 * screens (wrapping underneath on narrow ones). A 2px ink rule closes the
 * block, so the working content starts on a firm edge. Without a caption a
 * short vermilion bar stands in its place.
 */
export function PageHeader({
  title,
  caption,
  children,
  actions,
}: {
  title: React.ReactNode;
  /** A short grey line over the title — the desk, the queue, the section. */
  caption?: React.ReactNode;
  /** The description paragraph. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b-2 border-ink pb-7">
      <div className="min-w-0">
        {caption ? (
          <p className="mb-2 text-[15px] font-semibold text-muted-foreground">{caption}</p>
        ) : (
          <div aria-hidden className="mb-4 h-1 w-10 bg-vermilion" />
        )}
        <h1 className="text-[clamp(30px,3.9vw,46px)] leading-[1.05] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {children && (
          <p className="mt-3 max-w-[72ch] text-[16px] leading-relaxed text-body">{children}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

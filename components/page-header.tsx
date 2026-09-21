/**
 * The title block at the top of every portal page: a vermilion eyebrow, a
 * serif heading, and a line on what the page is for. `actions` sits to the
 * right on wide screens and wraps underneath on narrow ones.
 */
export function PageHeader({
  title,
  eyebrow,
  children,
  actions,
}: {
  title: React.ReactNode;
  /** A small label above the title — the console or section it belongs to. */
  eyebrow?: React.ReactNode;
  /** The description paragraph. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2.5 inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-vermilion-deep uppercase">
            <span aria-hidden className="h-px w-5 bg-current opacity-60" />
            {eyebrow}
          </p>
        )}
        <h1 className="text-[clamp(28px,3.4vw,40px)] leading-[1.1] font-semibold text-foreground">
          {title}
        </h1>
        {children && (
          <p className="mt-2.5 max-w-[75ch] text-[15px] leading-relaxed text-body">{children}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

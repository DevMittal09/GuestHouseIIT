/**
 * The title block at the top of every portal page: a serif heading, the
 * vermilion rule from the guest house website, and a line on what the page is for.
 * `actions` sits to the right on wide screens and wraps underneath on narrow
 * ones.
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[clamp(26px,3vw,32px)] leading-tight font-semibold text-foreground">
          {title}
        </h1>
        <div aria-hidden className="mt-2.5 mb-3 h-[3px] w-10 bg-vermilion" />
        {children && <p className="max-w-[75ch] text-body">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

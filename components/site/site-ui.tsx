import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitePhoto } from "@/lib/site";

/**
 * Building blocks of the public website, in the institute's own palette
 * (iitpkd.ac.in: vermilion, charcoal, a light band, Source Serif headings).
 * Structure comes from hairline rules, type and whitespace — no shadows, no
 * gradients, near-square corners. Server components; nothing here needs the
 * client.
 */

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1200px] px-[clamp(16px,4vw,32px)]", className)}
      {...props}
    />
  );
}

/** A short vermilion bar — the institute's accent under a title. */
export function AccentRule({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-[3px] w-10 bg-vermilion", className)} />;
}

/** Small uppercase label, in the deep vermilion that passes contrast at this size. */
export function Label({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-[12px] font-bold tracking-[0.14em] text-vermilion-deep uppercase",
        className
      )}
      {...props}
    />
  );
}

/**
 * A page's one `<h1>`, with an optional lead paragraph. For the sign-in pages,
 * where it sits in a column beside the form; content pages use
 * `PageMasthead`.
 */
export function PageTitle({
  children,
  intro,
  className,
}: {
  children: React.ReactNode;
  intro?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <AccentRule className="mb-5" />
      <h1 className="mb-4 text-[clamp(34px,4.6vw,50px)] leading-[1.05] font-semibold tracking-[-0.015em] text-ink">
        {children}
      </h1>
      {intro && <p className="max-w-[60ch] text-[17px] leading-[1.65] text-body">{intro}</p>}
    </div>
  );
}

/**
 * The band at the top of a content page: a breadcrumb back to Home, the
 * page's `<h1>` and its lead — the grey breadcrumb band iitpkd.ac.in puts on
 * its own inner pages. `aside` sits to the right on wide screens.
 */
export function PageMasthead({
  title,
  intro,
  aside,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  aside?: React.ReactNode;
  /** A line under the lead: an edition note, a count. */
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-band">
      <Container className="pt-8 pb-10 sm:pt-10 sm:pb-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-[13.5px] text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link href="/" className="text-muted-foreground hover:text-vermilion-deep">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              {title}
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <div className="min-w-0 max-w-[62ch]">
            <h1 className="text-[clamp(36px,5vw,56px)] leading-[1.02] font-semibold tracking-[-0.02em] text-ink">
              {title}
            </h1>
            {intro && <p className="mt-5 text-[17.5px] leading-[1.6] text-body">{intro}</p>}
            {children && <div className="mt-4">{children}</div>}
          </div>
          {aside && <div className="min-w-0">{aside}</div>}
        </div>
      </Container>
    </div>
  );
}

/**
 * How a section of a long page opens: a full-width hairline with the
 * section's label on it and, optionally, a link at the far end; then the
 * heading. Newspaper furniture rather than a centred title over a card grid.
 */
export function SectionHead({
  label,
  title,
  id,
  link,
  tone = "light",
  className,
}: {
  label: string;
  title: React.ReactNode;
  id?: string;
  link?: { href: string; label: string; external?: boolean };
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={className}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t pt-3.5",
          dark ? "border-white/25" : "border-ink"
        )}
      >
        <p
          className={cn(
            "text-[12px] font-bold tracking-[0.14em] uppercase",
            dark ? "text-saffron" : "text-vermilion-deep"
          )}
        >
          {label}
        </p>
        {link && (
          <ArrowLink
            href={link.href}
            external={link.external}
            className={dark ? "text-white hover:text-saffron" : undefined}
          >
            {link.label}
          </ArrowLink>
        )}
      </div>
      <h2
        id={id}
        className={cn(
          "mt-5 max-w-[22ch] text-[clamp(30px,3.8vw,44px)] leading-[1.08] font-semibold tracking-[-0.015em]",
          dark ? "text-white" : "text-ink"
        )}
      >
        {title}
      </h2>
    </div>
  );
}

/** A text link with an arrow that moves on hover; `external` opens a new tab. */
export function ArrowLink({
  href,
  children,
  external,
  className,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  const Icon = external ? ArrowUpRight : ArrowRight;
  const body = (
    <>
      {children}
      <Icon
        aria-hidden
        className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
      />
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </>
  );
  const classes = cn(
    "group inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[6px] transition-colors duration-150 hover:text-vermilion-deep",
    className
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {body}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {body}
    </Link>
  );
}

export function BulletList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {items.map((item) => (
        <li key={item} className="relative pl-4 text-[15px] leading-normal text-body">
          <span aria-hidden className="absolute top-[9px] left-0 size-[5px] bg-vermilion" />
          {item}
        </li>
      ))}
    </ul>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[3px] px-6 py-3.5 text-[15.5px] font-semibold transition-colors duration-150";

/** Link styles for the public site's button kinds. */
export const siteButton = {
  /** The call to action. Deep vermilion: white on the bright one is 3.8:1. */
  brand: cn(BUTTON_BASE, "bg-vermilion-deep text-white hover:bg-vermilion-hover hover:text-white"),
  ink: cn(BUTTON_BASE, "bg-ink text-white hover:bg-ink-soft hover:text-white"),
  outline: cn(
    BUTTON_BASE,
    "border border-ink bg-transparent text-ink hover:bg-ink hover:text-white"
  ),
  /** Outlined, on an ink background. */
  outlineLight: cn(
    BUTTON_BASE,
    "border border-white/60 bg-transparent text-white hover:border-white hover:bg-white hover:text-ink"
  ),
};

export function NoticeBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-saffron bg-notice px-5 py-4">
      <p className="mb-1.5 text-[12px] font-bold tracking-[0.14em] text-ink uppercase">{label}</p>
      <div className="text-[15.5px] leading-[1.55] text-body">{children}</div>
    </div>
  );
}

/**
 * A photograph, or — until the office supplies it — a labelled placeholder of
 * the same shape, so the layout is final either way. `aspect` is a CSS
 * aspect-ratio such as "4/3"; leave it out to fill a sized parent.
 */
export function SitePhotoFrame({
  photo,
  aspect,
  sizes,
  priority,
  zoom,
  className,
}: {
  photo: SitePhoto;
  aspect?: string;
  sizes: string;
  priority?: boolean;
  /** Ease the photo in a little when a parent `group` is hovered. */
  zoom?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative min-w-0 overflow-hidden rounded-[2px] bg-band", className)}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {photo.src ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn(
            "object-cover",
            zoom && "transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.03]"
          )}
        />
      ) : (
        <div
          role="img"
          aria-label={`${photo.alt} (photograph to follow)`}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 border border-dashed border-border-strong p-3 text-center"
        >
          <ImageIcon aria-hidden className="size-6 text-muted-foreground" />
          <span className="text-sm font-semibold text-body">{photo.alt}</span>
          <span className="text-xs text-muted-foreground">Photograph to follow</span>
        </div>
      )}
    </div>
  );
}

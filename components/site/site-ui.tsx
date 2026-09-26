import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitePhoto } from "@/lib/site";

/**
 * Building blocks of the public website, in the institute's own palette
 * (iitpkd.ac.in: vermilion, charcoal, a warm light band, Source Serif
 * headings). Clean and institutional: photographs **contained** in the
 * layout (never full-bleed), bordered cards, generous whitespace, 6–8px
 * corners, no shadows, no gradients. Server components.
 */

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1240px] px-[clamp(16px,4vw,40px)]", className)}
      {...props}
    />
  );
}

/** Small tracked capitals over a heading, in the deep vermilion that passes contrast at this size. */
export function Label({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-[11.5px] font-semibold tracking-[0.22em] text-vermilion-deep uppercase",
        className
      )}
      {...props}
    />
  );
}

/**
 * A page's one `<h1>`, with an optional lead paragraph. For the sign-in pages,
 * where it sits beside the form; content pages use `PageMasthead`.
 */
export function PageTitle({
  children,
  intro,
  kicker,
  className,
}: {
  children: React.ReactNode;
  intro?: React.ReactNode;
  kicker?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {kicker && <Label className="mb-4">{kicker}</Label>}
      <h1 className="text-[clamp(36px,4.6vw,52px)] leading-[1.04] font-semibold tracking-[-0.02em] text-ink">
        {children}
      </h1>
      {intro && <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.65] text-body">{intro}</p>}
    </div>
  );
}

/**
 * The top of a content page, as institute sites do it: a light band with a
 * breadcrumb back to Home, the page's `<h1>`, a lead and an optional note.
 * (It carried a photo banner for an afternoon on 26 Sep 2026; the owner found
 * full-width photographs overwhelming, so pages open on type again.)
 */
export function PageMasthead({
  title,
  intro,
  note,
  aside,
}: {
  title: string;
  intro?: React.ReactNode;
  /** A small line under the lead — an edition note, a count. */
  note?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-band">
      <Container className="pt-9 pb-11 sm:pt-11 sm:pb-14">
        <nav aria-label="Breadcrumb" className="mb-5 text-[13px] text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link href="/" className="text-muted-foreground hover:text-ink">
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
          <div className="min-w-0 max-w-[60ch]">
            <h1 className="text-[clamp(34px,4.4vw,50px)] leading-[1.06] font-semibold tracking-[-0.02em] text-ink">
              {title}
            </h1>
            {intro && <p className="mt-4 text-[17px] leading-[1.6] text-body">{intro}</p>}
            {note && <p className="mt-3 text-[14px] leading-[1.55] text-muted-foreground">{note}</p>}
          </div>
          {aside && <div className="min-w-0">{aside}</div>}
        </div>
      </Container>
    </div>
  );
}

/** A section's heading, with small capitals over it and an optional link at the far end. */
export function SectionHead({
  label,
  title,
  id,
  link,
  tone = "light",
  className,
}: {
  label?: string;
  title: React.ReactNode;
  id?: string;
  link?: { href: string; label: string };
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-4", className)}>
      <div className="min-w-0">
        {label && <Label className={cn("mb-4", dark && "text-saffron")}>{label}</Label>}
        <h2
          id={id}
          className={cn(
            "max-w-[24ch] text-[clamp(28px,3.2vw,40px)] leading-[1.1] font-semibold tracking-[-0.015em]",
            dark ? "text-white" : "text-ink"
          )}
        >
          {title}
        </h2>
      </div>
      {link && (
        <ArrowLink href={link.href} className={dark ? "text-white hover:text-saffron" : undefined}>
          {link.label}
        </ArrowLink>
      )}
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
        className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1"
      />
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </>
  );
  const classes = cn(
    "group inline-flex items-center gap-2 text-[15px] font-semibold text-ink transition-colors duration-200 hover:text-vermilion-deep",
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

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[6px] px-6 py-3 text-[15px] font-semibold transition-colors duration-200";

/** Link styles for the public site's button kinds. */
export const siteButton = {
  /** The call to action. Deep vermilion: white on the bright one is 3.8:1. */
  brand: cn(BUTTON_BASE, "bg-vermilion-deep text-white hover:bg-vermilion-hover hover:text-white"),
  ink: cn(BUTTON_BASE, "bg-ink text-white hover:bg-ink-soft hover:text-white"),
  outline: cn(BUTTON_BASE, "border border-ink bg-transparent text-ink hover:bg-ink hover:text-white"),
  /** Solid white, on a photograph or ink. */
  light: cn(BUTTON_BASE, "bg-white text-ink hover:bg-band hover:text-ink"),
  /** Outlined, on a photograph or ink. */
  outlineLight: cn(
    BUTTON_BASE,
    "border border-white/70 bg-transparent text-white hover:border-white hover:bg-white hover:text-ink"
  ),
};

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
      className={cn("relative min-w-0 overflow-hidden rounded-[8px] bg-band", className)}
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
            zoom && "transition-transform duration-[900ms] ease-out motion-safe:group-hover:scale-[1.04]"
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

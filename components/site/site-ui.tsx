import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitePhoto } from "@/lib/site";

/**
 * Building blocks of the public website, in the institute's own palette
 * (iitpkd.ac.in: vermilion, charcoal, a warm light band, Source Serif
 * headings). Photographs carry the pages; type and whitespace do the rest.
 * No drop shadows, no decorative gradients (a dark wash over a photo, for
 * legible text, is the only one), near-square corners. Server components.
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
 * The top of a content page: a breadcrumb back to Home, the page's `<h1>`, a
 * lead and an optional note. With a `photo` it is a banner — the photograph
 * under a dark wash, the words in white; without one, the warm band.
 */
export function PageMasthead({
  title,
  intro,
  note,
  aside,
  photo,
}: {
  title: string;
  intro?: React.ReactNode;
  /** A small line under the lead — an edition note, a count. Inherits its colour. */
  note?: React.ReactNode;
  aside?: React.ReactNode;
  photo?: SitePhoto;
}) {
  const banner = Boolean(photo?.src);
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden",
        banner ? "bg-ink text-white" : "border-b border-border bg-band"
      )}
    >
      {banner && photo?.src && (
        <>
          <Image src={photo.src} alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-ink/90 via-ink/55 to-ink/25" />
        </>
      )}
      <Container className={banner ? "pt-24 pb-12 sm:pt-32 sm:pb-16 lg:pt-44 lg:pb-20" : "pt-10 pb-12 sm:pt-12 sm:pb-14"}>
        <nav
          aria-label="Breadcrumb"
          className={cn("mb-5 text-[13px]", banner ? "text-white/75" : "text-muted-foreground")}
        >
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link
                href="/"
                className={banner ? "text-white/75 hover:text-white" : "text-muted-foreground hover:text-ink"}
              >
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className={banner ? "text-white" : "text-ink"}>
              {title}
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <div className="min-w-0 max-w-[60ch]">
            <h1
              className={cn(
                "text-[clamp(40px,5.6vw,68px)] leading-[1] font-semibold tracking-[-0.025em]",
                banner ? "text-white" : "text-ink"
              )}
            >
              {title}
            </h1>
            {intro && (
              <p className={cn("mt-5 text-[17.5px] leading-[1.6]", banner ? "text-white/85" : "text-body")}>
                {intro}
              </p>
            )}
            {note && (
              <p className={cn("mt-4 text-[14px] leading-[1.55]", banner ? "text-white/70" : "text-muted-foreground")}>
                {note}
              </p>
            )}
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
            "max-w-[20ch] text-[clamp(32px,4vw,50px)] leading-[1.04] font-semibold tracking-[-0.02em]",
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
  "inline-flex items-center justify-center gap-2 rounded-[3px] px-6 py-3.5 text-[15px] font-semibold tracking-[0.01em] transition-colors duration-200";

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

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapPin, SitePhoto } from "@/lib/site";

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
  center,
  className,
}: {
  children: React.ReactNode;
  intro?: React.ReactNode;
  kicker?: string;
  /** Centre the block - the booking doors, which have no photograph beside them. */
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(center && "text-center", className)}>
      {kicker && <Label className="mb-4">{kicker}</Label>}
      <h1 className="text-[clamp(36px,4.8vw,56px)] leading-[1.03] font-semibold tracking-[-0.022em] text-ink">
        {children}
      </h1>
      {intro && (
        <p className={cn("mt-5 max-w-[52ch] text-[17px] leading-[1.65] text-body", center && "mx-auto")}>
          {intro}
        </p>
      )}
    </div>
  );
}

/**
 * The top of a content page, as institute sites do it: a light band with a
 * breadcrumb back to Home, a short vermilion rule, the page's `<h1>`, a lead
 * and an optional note. (It carried a photo banner for an afternoon on 26 Sep
 * 2026; the owner found full-width photographs overwhelming, so pages open on
 * type again.)
 */
export function PageMasthead({
  title,
  intro,
  note,
  aside,
}: {
  title: string;
  intro?: React.ReactNode;
  /** A small line under the lead - an edition note, a count. */
  note?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-band">
      <Container className="pt-8 pb-12 sm:pt-10 sm:pb-16">
        <nav aria-label="Breadcrumb" className="mb-10 text-meta text-muted-foreground">
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
        {/* Asymmetric, editorial: the title large in seven columns, the lead
            set under a vermilion rule in the remaining five, both sitting on
            one baseline. */}
        <div className="grid items-end gap-x-10 gap-y-6 lg:grid-cols-12">
          <h1 className="min-w-0 text-[clamp(2.25rem,1.3rem+3vw,3.75rem)] leading-[1.02] font-semibold tracking-[-0.026em] text-ink lg:col-span-7">
            {title}
          </h1>
          {(intro || note || aside) && (
            <div className="min-w-0 border-t-4 border-vermilion pt-5 lg:col-span-5">
              {intro && <p className="text-[17px] leading-[1.6] text-body">{intro}</p>}
              {note && <p className="mt-3 text-[14px] leading-[1.55] text-muted-foreground">{note}</p>}
              {aside && <div className="mt-5">{aside}</div>}
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}

/**
 * A section's opener: a tracked label, the serif heading, and a short
 * vermilion stub under it.
 *
 * **The full-width hairline is gone** (27 Oct 2026, the owner: "remove the
 * default horizontal lines or underlines beneath page and section headings -
 * use more refined alternatives"). A rule ran across the page above every
 * heading on the site, which is the most generic device a page can own, and
 * four sections carrying the same one is what makes a page read as a
 * template. What is left is the type and one 40px mark - the stub the home
 * page has carried since 15 Oct 2026, promoted to the device every section
 * opens on.
 *
 * `align="center"` centres the whole block, for the sections the owner asked
 * to centre (Amenities, Our guest houses, Contact us). A section with a
 * `link` stays left: the link sits on the heading's own line, at the far
 * right, where a centred heading would leave it stranded.
 */
export function SectionHead({
  label,
  title,
  id,
  link,
  align = "left",
  tone = "light",
  className,
}: {
  label?: string;
  title: React.ReactNode;
  id?: string;
  link?: { href: string; label: string };
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  const centred = align === "center";
  return (
    <div className={cn("min-w-0", centred && "text-center", className)}>
      {label && <Label className={cn("mb-3", dark && "text-saffron")}>{label}</Label>}
      <div
        className={cn(
          "flex flex-wrap items-end gap-x-8 gap-y-2",
          centred ? "justify-center" : "justify-between"
        )}
      >
        <h2
          id={id}
          className={cn("max-w-[24ch] text-title font-semibold", dark ? "text-white" : "text-ink")}
        >
          {title}
        </h2>
        {link && (
          <ArrowLink
            href={link.href}
            className={cn("mb-1.5 ml-auto", dark && "text-white hover:text-saffron")}
          >
            {link.label}
          </ArrowLink>
        )}
      </div>
      <div
        aria-hidden
        className={cn("mt-5 h-[3px] w-10 bg-vermilion", centred && "mx-auto")}
      />
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
  /**
   * The emblem's saffron, carrying ink (8.4:1) - the second solid button
   * beside the vermilion one (27 Oct 2026, the owner: *Book a Meal* "looks
   * too transparent... give it a solid, attractive colour that complements
   * the Book a Room button"). Red and gold is the institute's own pairing,
   * and the outline it replaced read as a disabled button over a photograph.
   */
  saffron: cn(BUTTON_BASE, "bg-saffron text-ink hover:bg-saffron-deep hover:text-ink"),
  /** Solid white, on a photograph or ink. */
  light: cn(BUTTON_BASE, "bg-white text-ink hover:bg-band hover:text-ink"),
  /** Outlined, on a photograph or ink. */
  outlineLight: cn(
    BUTTON_BASE,
    "border border-white/70 bg-transparent text-white hover:border-white hover:bg-white hover:text-ink"
  ),
};

/**
 * A photograph, or - until the office supplies it - a labelled placeholder of
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

/**
 * One guest house on the map.
 *
 * **Nothing is printed under it** (27 Oct 2026, the owner: the embed already
 * offers "View larger map" and the directions, "so remove the redundant links
 * below the maps", and the name "will already appear in the section above").
 * So this is the frame and the iframe, and whoever draws it says which guest
 * house it is - the tab on `/contact`, the heading over it on the home page.
 * It is shared so the two cannot disagree about the embed's attributes.
 */
export function MapEmbed({ pin, className }: { pin: MapPin; className?: string }) {
  return (
    <iframe
      title={`${pin.name} on the map`}
      src={pin.embedUrl}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className={cn("block w-full border-0 bg-band", className)}
    />
  );
}

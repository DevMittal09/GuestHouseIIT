import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitePhoto } from "@/lib/site";

/**
 * Building blocks of the public website's look: a 1240px column, vermilion
 * eyebrows, serif display headings, pill buttons, and photographs with soft
 * rounded corners. Server components — nothing here needs the client.
 * See .memories/10-ui-design.md for the palette and the rules behind it.
 */

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1240px] px-[clamp(16px,4vw,32px)]", className)}
      {...props}
    />
  );
}

const EYEBROW_TONES = {
  vermilion: "text-vermilion-deep",
  saffron: "text-saffron",
  muted: "text-muted-foreground",
} as const;

/** Small-caps label above a heading, with a short rule in front of it. */
export function Eyebrow({
  className,
  tone = "vermilion",
  rule = true,
  children,
  ...props
}: React.ComponentProps<"div"> & { tone?: keyof typeof EYEBROW_TONES; rule?: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 text-[11.5px] font-bold tracking-[0.18em] uppercase",
        EYEBROW_TONES[tone],
        className
      )}
      {...props}
    >
      {rule && <span aria-hidden className="h-px w-7 bg-current opacity-60" />}
      {children}
    </div>
  );
}

/** A section's eyebrow, `<h2>` and lead, left-aligned or centred. */
export function SectionHeading({
  eyebrow,
  title,
  intro,
  id,
  align = "left",
  tone = "light",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  id?: string;
  align?: "left" | "center";
  /** `dark` for a heading set on an ink background. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const centred = align === "center";
  return (
    <div className={cn(centred && "mx-auto text-center", "max-w-[720px]", className)}>
      {eyebrow && (
        <Eyebrow tone={tone === "dark" ? "saffron" : "vermilion"} className="mb-4">
          {eyebrow}
        </Eyebrow>
      )}
      <h2
        id={id}
        className={cn(
          "text-[clamp(30px,4vw,46px)] leading-[1.08] font-semibold",
          tone === "dark" ? "text-white" : "text-foreground"
        )}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={cn(
            "mt-4 text-[17px] leading-[1.7]",
            centred && "mx-auto",
            "max-w-[62ch]",
            tone === "dark" ? "text-white/70" : "text-body"
          )}
        >
          {intro}
        </p>
      )}
    </div>
  );
}

/** The italic, vermilion-to-saffron accent word inside a display heading. */
export function Accent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <em
      className={cn(
        "bg-gradient-to-r from-vermilion to-saffron bg-clip-text pr-[0.06em] font-medium text-transparent italic",
        className
      )}
    >
      {children}
    </em>
  );
}

/**
 * The top of every inner page: the page's one `<h1>` over a photograph,
 * darkened so white type holds its contrast whatever the picture.
 */
export function PageHero({
  eyebrow,
  title,
  intro,
  photo,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  photo: SitePhoto;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-ink">
      {photo.src && (
        <Image
          src={photo.src}
          alt=""
          fill
          sizes="100vw"
          preload
          className="-z-10 animate-drift object-cover opacity-45"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/30"
      />
      <div aria-hidden className="grain absolute inset-0 -z-10" />
      <Container className="relative pt-[clamp(56px,9vw,104px)] pb-[clamp(48px,7vw,88px)]">
        <div className="max-w-[760px] animate-rise">
          <Eyebrow tone="saffron" className="mb-5">
            {eyebrow}
          </Eyebrow>
          <h1 className="text-[clamp(38px,5.6vw,64px)] leading-[1.04] font-semibold text-white">
            {title}
          </h1>
          {intro && (
            <p className="mt-5 max-w-[60ch] text-[clamp(16px,1.6vw,18.5px)] leading-[1.7] text-white/75">
              {intro}
            </p>
          )}
          {children}
        </div>
      </Container>
    </section>
  );
}

export function BulletList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {items.map((item) => (
        <li key={item} className="relative pl-5 text-[15px] leading-[1.6] text-body">
          <span
            aria-hidden
            className="absolute top-[0.6em] left-0 size-[7px] rounded-full bg-gradient-to-br from-vermilion to-saffron"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold whitespace-nowrap transition-all duration-200 active:translate-y-px";

/** Link styles for the public site's buttons. */
export const siteButton = {
  /** The call to action: vermilion, white text on the deep shade. */
  primary: cn(
    BUTTON_BASE,
    "bg-vermilion-deep text-white shadow-glow hover:-translate-y-0.5 hover:bg-vermilion-hover hover:text-white"
  ),
  /** Ink, for secondary actions on light backgrounds. */
  dark: cn(BUTTON_BASE, "bg-ink text-white hover:bg-ink-soft hover:text-white"),
  /** Outlined, on light backgrounds. */
  outline: cn(
    BUTTON_BASE,
    "border border-border-strong bg-white text-foreground hover:border-foreground hover:text-foreground"
  ),
  /** Frosted, on photographs and ink backgrounds. */
  glass: cn(
    BUTTON_BASE,
    "border border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
  ),
};

export function NoticeBox({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-notice-border bg-notice px-5 py-4 pl-6",
        className
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-saffron to-vermilion" />
      <div className="mb-1.5 text-[11px] font-bold tracking-[0.16em] text-[#8a5300] uppercase">
        {label}
      </div>
      <div className="text-[15px] leading-[1.6] text-body">{children}</div>
    </div>
  );
}

/**
 * A photograph, or — until the office supplies it — a labelled placeholder of
 * the same shape, so the layout is final either way. `aspect` is a CSS
 * aspect-ratio such as "4/3"; leave it out when the parent sets the height.
 */
export function SitePhotoFrame({
  photo,
  aspect,
  sizes,
  preload,
  className,
  imageClassName,
}: {
  photo: SitePhoto;
  aspect?: string;
  sizes: string;
  preload?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div
      className={cn("relative min-w-0 overflow-hidden rounded-2xl bg-band", className)}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {photo.src ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          preload={preload}
          className={cn("object-cover", imageClassName)}
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

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitePhoto } from "@/lib/site";

/**
 * Building blocks of the public website's look (design_handoff/README.md):
 * a 1200px column, the 56px gold rule under headings, small-caps gold
 * eyebrows, dot-bulleted lists and near-square buttons. Server components —
 * nothing here needs the client.
 */

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1200px] px-[clamp(14px,4vw,24px)]", className)}
      {...props}
    />
  );
}

export function GoldRule({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-[3px] w-14 bg-gold", className)} />;
}

export function Eyebrow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-[11.5px] font-bold tracking-[0.16em] text-gold-dark uppercase",
        className
      )}
      {...props}
    />
  );
}

/** A page's one `<h1>`, its gold rule, and an optional lead paragraph. */
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
      <h1 className="mb-3.5 text-[clamp(30px,4vw,42px)] leading-[1.15] font-semibold text-navy">
        {children}
      </h1>
      <GoldRule className="mb-5" />
      {intro && (
        <p className="max-w-[66ch] text-[17px] leading-[1.65] text-body">{intro}</p>
      )}
    </div>
  );
}

export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <>
      <h2 id={id} className="mb-2 text-[clamp(26px,3.4vw,36px)] font-semibold text-navy">
        {children}
      </h2>
      <GoldRule />
    </>
  );
}

export function BulletList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {items.map((item) => (
        <li key={item} className="relative pl-4 text-[15px] leading-normal text-body">
          <span aria-hidden className="absolute top-2 left-0 size-[5px] rounded-full bg-gold" />
          {item}
        </li>
      ))}
    </ul>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[3px] text-[15.5px] font-bold transition-colors duration-150";

/** Link styles for the public site's three button kinds. */
export const siteButton = {
  gold: cn(BUTTON_BASE, "bg-gold px-7 py-3.5 text-navy hover:bg-gold-hover hover:text-navy"),
  outline: cn(
    BUTTON_BASE,
    "border border-border-strong bg-white px-[26px] py-3.5 text-navy hover:border-navy hover:text-navy"
  ),
  navy: cn(BUTTON_BASE, "bg-navy px-6 py-3.5 text-white hover:bg-navy-dark hover:text-white"),
};

export function NoticeBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-l-4 border-notice-border border-l-gold bg-notice px-5 py-[18px]">
      <div className="mb-2 text-[11.5px] font-bold tracking-[0.16em] text-gold-darkest uppercase">
        {label}
      </div>
      <div className="text-[15.5px] leading-[1.55] text-body">{children}</div>
    </div>
  );
}

/**
 * A photograph, or — until the office supplies it — a labelled placeholder of
 * the same shape, so the layout is final either way. `aspect` is a CSS
 * aspect-ratio such as "4/3".
 */
export function SitePhotoFrame({
  photo,
  aspect,
  sizes,
  priority,
  className,
}: {
  photo: SitePhoto;
  aspect: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative min-w-0 overflow-hidden rounded-[3px] bg-band", className)}
      style={{ aspectRatio: aspect }}
    >
      {photo.src ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
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

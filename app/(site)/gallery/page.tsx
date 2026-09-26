import type { Metadata } from "next";
import { Container, PageMasthead, SectionHead, SitePhotoFrame } from "@/components/site/site-ui";
import { GALLERY_SECTIONS, type SitePhoto } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Gallery" };

/**
 * Grouped by subject, not by guest house: the office has not said which
 * guest house each photograph shows (see `GALLERY_SECTIONS`). No visible
 * captions (the owner, 26 Sep 2026) — each photo keeps its alt text for
 * screen readers, and opens full size in a new tab.
 */

/** A section this long leads with one photograph at double size. */
const FEATURE_FROM = 4;

export default function GalleryPage() {
  return (
    <>
      <PageMasthead
        title="Gallery"
        intro="The grounds, the rooms and suites, and the common spaces."
      />

      <Container className="pt-[clamp(56px,7vw,96px)] pb-24">
        {GALLERY_SECTIONS.map((section, i) => {
          const feature = section.photos.length >= FEATURE_FROM;
          return (
            <section
              key={section.title}
              aria-labelledby={`gallery-${i}`}
              className={i > 0 ? "mt-24" : undefined}
            >
              <SectionHead id={`gallery-${i}`} label={section.qualifier} title={section.title} />
              <ul className="mt-10 grid grid-flow-dense grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {section.photos.map((photo, j) => (
                  <GalleryItem key={photo.alt} photo={photo} featured={feature && j === 0} />
                ))}
              </ul>
            </section>
          );
        })}
      </Container>
    </>
  );
}

function GalleryItem({ photo, featured }: { photo: SitePhoto; featured: boolean }) {
  const frame = (
    <SitePhotoFrame
      photo={photo}
      sizes={
        featured
          ? "(min-width: 1024px) 66vw, 100vw"
          : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      }
      zoom
      className={cn("aspect-[3/2]", featured && "lg:aspect-auto lg:h-full")}
    />
  );

  return (
    <li className={cn("min-w-0", featured && "sm:col-span-2 lg:row-span-2")}>
      {photo.src ? (
        <a
          href={photo.src}
          target="_blank"
          rel="noopener noreferrer"
          className="group block h-full rounded-[8px]"
        >
          {frame}
          <span className="sr-only">(opens the full-size photograph)</span>
        </a>
      ) : (
        frame
      )}
    </li>
  );
}

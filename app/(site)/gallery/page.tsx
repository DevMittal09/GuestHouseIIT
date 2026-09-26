import type { Metadata } from "next";
import { Container, PageMasthead, SectionHead, SitePhotoFrame } from "@/components/site/site-ui";
import { GALLERY_SECTIONS, type SitePhoto } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Gallery" };

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but everything it *says* comes from `lib/site-data.ts`, which
 * holds its answers for half an hour under the `site` cache tag, so a visitor
 * does not wait for a database round trip to read the guidelines (Phase 9).
 * `revalidateEverything()` drops that tag the moment a setting or a guest
 * house changes, so it is never stale in practice.
 *
 * Grouped by subject, not by guest house: the office has not said which
 * guest house each photograph shows (see `GALLERY_SECTIONS`). Every photo
 * carries a visible caption, and opens full size in a new tab.
 */

/** A section this long leads with one photograph at double size. */
const FEATURE_FROM = 4;

export default function GalleryPage() {
  const count = GALLERY_SECTIONS.reduce((n, s) => n + s.photos.filter((p) => p.src).length, 0);

  return (
    <>
      <PageMasthead
        title="Gallery"
        intro="The grounds, the rooms and suites, and the common spaces of the institute's guest houses."
      >
        {count > 0 && (
          <p className="text-[14.5px] text-muted-foreground">
            {count} photographs · select one to open it full size
          </p>
        )}
      </PageMasthead>

      <Container className="pt-12 pb-24">
        {GALLERY_SECTIONS.map((section, i) => {
          const feature = section.photos.length >= FEATURE_FROM;
          return (
            <section
              key={section.title}
              aria-labelledby={`gallery-${i}`}
              className={i > 0 ? "mt-20" : undefined}
            >
              <SectionHead id={`gallery-${i}`} label={section.qualifier} title={section.title} />
              <ul className="mt-8 grid grid-flow-dense grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
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
          ? "(min-width: 1024px) 66vw, (min-width: 640px) 100vw, 100vw"
          : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      }
      zoom
      className={cn("aspect-[3/2]", featured && "lg:aspect-auto lg:min-h-0 lg:flex-1")}
    />
  );
  const caption = (
    <span className="mt-2.5 block text-[14px] leading-snug text-body">{photo.alt}</span>
  );

  return (
    <li className={cn("flex min-w-0 flex-col", featured && "sm:col-span-2 lg:row-span-2")}>
      {photo.src ? (
        <a
          href={photo.src}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-h-0 flex-1 flex-col text-ink no-underline"
        >
          {frame}
          {caption}
          <span className="sr-only">(opens the full-size photograph)</span>
        </a>
      ) : (
        <>
          {frame}
          {caption}
        </>
      )}
    </li>
  );
}

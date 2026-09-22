import type { Metadata } from "next";
import { Container, PageTitle, SitePhotoFrame } from "@/components/site/site-ui";
import { GALLERY_SECTIONS } from "@/lib/site";

export const metadata: Metadata = { title: "Gallery" };

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but everything it *says* comes from `lib/site-data.ts`, which
 * holds its answers for half an hour under the `site` cache tag, so a visitor
 * does not wait for a database round trip to read the guidelines (Phase 9).
 * `revalidateEverything()` drops that tag the moment a setting or a guest
 * house changes, so it is never stale in practice.
 */

export default function GalleryPage() {
  return (
    <Container className="pt-11 pb-[88px]">
      <PageTitle className="mb-5">Gallery</PageTitle>

      {GALLERY_SECTIONS.map((section, i) => (
        <section
          key={section.title}
          aria-labelledby={`gallery-${i}`}
          className={i < GALLERY_SECTIONS.length - 1 ? "mb-14" : undefined}
        >
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3.5 border-b-2 border-border pb-2.5">
            <h2 id={`gallery-${i}`} className="text-[28px] font-semibold text-navy">
              {section.title}
            </h2>
            <span className="text-[12.5px] tracking-[0.12em] text-muted-foreground uppercase">
              {section.qualifier}
            </span>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3.5">
            {section.photos.map((photo) => (
              <li key={photo.alt}>
                {photo.src ? (
                  <a
                    href={photo.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-[3px]"
                  >
                    <SitePhotoFrame
                      photo={photo}
                      aspect="3/2"
                      sizes="(min-width: 1000px) 25vw, (min-width: 500px) 50vw, 100vw"
                      className="transition-opacity duration-150 group-hover:opacity-90"
                    />
                    <span className="sr-only">(opens the full-size photograph)</span>
                  </a>
                ) : (
                  <SitePhotoFrame photo={photo} aspect="3/2" sizes="25vw" />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Container>
  );
}

import type { Metadata } from "next";
import { GalleryGrid } from "@/components/site/gallery-grid";
import { Container, PageHero } from "@/components/site/site-ui";
import { GALLERY_SECTIONS, PHOTOS } from "@/lib/site";

export const metadata: Metadata = { title: "Gallery" };

export default function GalleryPage() {
  const count = GALLERY_SECTIONS.reduce((n, s) => n + s.photos.length, 0);
  return (
    <>
      <PageHero
        eyebrow="Gallery"
        title="A look around"
        photo={PHOTOS.gazebo}
        intro={`${count} photographs of the rooms, suites, grounds and common spaces. Select any one to see it full size.`}
      />
      <Container className="py-[clamp(48px,7vw,96px)]">
        <GalleryGrid sections={GALLERY_SECTIONS} />
      </Container>
    </>
  );
}

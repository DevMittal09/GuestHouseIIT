import type { Metadata } from "next";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { PAGE_PHOTOS } from "@/lib/site";
import { joinNames } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { canBookOnBehalf } from "@/lib/access";
import { REQUESTER_ROLES } from "@/lib/types";

export const metadata: Metadata = { title: "Book a room" };

/** Public entry point for a room request: sign in, then straight to `/book`. */
export default async function BookRoomPage() {
  const [user, houses] = await Promise.all([getCurrentUser(), getSiteGuestHouses()]);
  const canBook =
    user !== null && (REQUESTER_ROLES.includes(user.role) || canBookOnBehalf(user.role));
  const where = joinNames(houses.map((h) => h.name)) || "the guest houses";

  return (
    <SignInPanel
      title="Book a room"
      intro={`Sign in to request a room at ${where}.`}
      photo={PAGE_PHOTOS.bookRoom}
      user={user}
      continueTo={canBook || !user ? "/book" : homeForRole(user.role)}
      continueLabel={canBook ? "Continue to booking" : "Go to your portal"}
      next="/book"
      submitLabel="Sign in to book"
      footnote="Visitors from outside the institute are booked by the person hosting them."
    />
  );
}

import type { Metadata } from "next";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { BulletList } from "@/components/site/site-ui";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
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
  const where = joinNames(houses.map((h) => h.name)) || "the institute guest houses";

  return (
    <SignInPanel
      title="Book a room"
      intro={`Sign in to raise a room request in ${where}. Requests are confirmed by the guest house office after approval.`}
      aside={
        <div className="border-t border-ink pt-4">
          <p className="mb-3 text-[12px] font-bold tracking-[0.14em] text-ink uppercase">
            Before you start
          </p>
          {/* Only what every requester's form asks for; the rest depends on
              the form the office configured for each role. */}
          <BulletList
            items={[
              "The dates and times of arrival and departure",
              "The name, gender and relationship of each guest, grouped by room",
              "The budget head the stay is charged to",
              "Identity documents for the guests, where your form asks for them",
            ]}
          />
        </div>
      }
      user={user}
      continueTo={canBook || !user ? "/book" : homeForRole(user.role)}
      continueLabel={canBook ? "Continue to booking" : "Go to your portal"}
      next="/book"
      submitLabel="Sign in to book"
      footnote="Guests outside the institute should have their host raise the request on their behalf."
    />
  );
}

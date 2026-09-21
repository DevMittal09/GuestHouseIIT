import type { Metadata } from "next";
import { CalendarRange } from "lucide-react";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { canBookOnBehalf } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { PHOTOS } from "@/lib/site";
import { joinNames } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { hasStay, parseStayQuery, stayQueryString } from "@/lib/stay-query";
import { formatDateValue } from "@/lib/tz";
import { REQUESTER_ROLES } from "@/lib/types";

export const metadata: Metadata = { title: "Book a room" };

/**
 * Public entry point for a room request: sign in, then straight to `/book`.
 * The home page's booking bar lands here with `?gh=&in=&out=`; they are
 * re-checked and carried through sign-in (`next`) so the form opens
 * pre-filled.
 */
export default async function BookRoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, houses, params] = await Promise.all([
    getCurrentUser(),
    getSiteGuestHouses(),
    searchParams,
  ]);
  const canBook =
    user !== null && (REQUESTER_ROLES.includes(user.role) || canBookOnBehalf(user.role));
  const where = joinNames(houses.map((h) => h.name)) || "the institute guest houses";

  const stay = parseStayQuery(params, houses.map((h) => h.id));
  const query = stayQueryString(stay);
  const bookPath = query ? `/book?${query}` : "/book";
  const house = houses.find((h) => h.id === stay.guestHouseId);

  return (
    <SignInPanel
      title="Book a room"
      photo={PHOTOS.bedroom}
      intro={`Sign in to raise a room request in ${where}. Requests are confirmed by the guest house office after approval.`}
      aside={
        hasStay(stay) && (
          <div className="inline-flex max-w-full items-center gap-3.5 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white backdrop-blur-md">
            <CalendarRange aria-hidden className="size-5 shrink-0 text-saffron" />
            <span className="min-w-0 text-[14.5px] leading-snug">
              <span className="block text-[11px] font-bold tracking-[0.16em] text-white/60 uppercase">
                Your stay
              </span>
              <span className="font-semibold">
                {[
                  house?.name ?? "Any guest house",
                  stay.checkIn &&
                    `${formatDateValue(stay.checkIn)}${stay.checkOut ? ` → ${formatDateValue(stay.checkOut)}` : ""}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </div>
        )
      }
      user={user}
      continueTo={canBook || !user ? bookPath : homeForRole(user.role)}
      continueLabel={canBook ? "Continue to booking" : "Go to your portal"}
      next={bookPath}
      submitLabel="Sign in to book"
      footnote="Guests outside the institute should have their host raise the request on their behalf."
    />
  );
}

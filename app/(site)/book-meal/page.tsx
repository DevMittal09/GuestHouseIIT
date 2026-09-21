import type { Metadata } from "next";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { canBookOnBehalf } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { MEALS_ONLY_AUDIENCE } from "@/lib/booking-types";
import { MEAL_KEYS, MEAL_LABELS, MEAL_TIMES } from "@/lib/meals";
import { homeForRole } from "@/lib/routes";
import { PHOTOS } from "@/lib/site";
import { joinNames, servingHouses } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { REQUESTER_ROLES } from "@/lib/types";

export const metadata: Metadata = { title: "Book meal" };

/** The booking form's meals door — see `app/(portal)/book/page.tsx`. */
const MEAL_BOOKING_PATH = "/book?service=meals_only";

/**
 * Public entry point for meals.
 *
 * It opens the booking form on `?service=meals_only`, which is the same door
 * the portal home offers — someone booking lunch for a visiting examiner
 * should not have to start a room request to find the option. The form falls
 * back to the ordinary room flow for a requester whose role cannot book meals
 * without a room, which is right: for them meals *are* part of a room booking,
 * chosen day by day, and only at guest houses flagged `serves_meals`.
 */
export default async function BookMealPage() {
  const [user, houses] = await Promise.all([getCurrentUser(), getSiteGuestHouses()]);
  const canBook =
    user !== null && (REQUESTER_ROLES.includes(user.role) || canBookOnBehalf(user.role));
  const serving = servingHouses(houses);
  const where = joinNames(serving.map((h) => h.name));

  return (
    <SignInPanel
      title="Book meal"
      photo={PHOTOS.livingDining}
      intro={
        serving.length > 0
          ? `Sign in to place breakfast, lunch or dinner requests for your stay. Meals are chosen day by day when you request a room at ${where}; ${MEALS_ONLY_AUDIENCE} can also book meals without a room.`
          : "Meals are not being served at the guest houses at present. You can still sign in to request a room."
      }
      aside={
        serving.length > 0 && (
          <dl className="grid max-w-[440px] grid-cols-3 overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-md">
            {MEAL_KEYS.map((meal, i) => (
              <div key={meal} className={i > 0 ? "border-l border-white/15 px-4 py-3" : "px-4 py-3"}>
                <dt className="text-[11px] font-bold tracking-[0.14em] text-saffron uppercase">
                  {MEAL_LABELS[meal]}
                </dt>
                <dd className="mt-1 text-[13.5px] font-semibold tabular-nums">{MEAL_TIMES[meal]}</dd>
              </div>
            ))}
          </dl>
        )
      }
      user={user}
      continueTo={canBook || !user ? MEAL_BOOKING_PATH : homeForRole(user.role)}
      continueLabel={canBook ? "Continue to booking" : "Go to your portal"}
      next={MEAL_BOOKING_PATH}
      submitLabel="Sign in to book meals"
      footnote="Choose vegetarian or non-vegetarian and every meal your stay covers is ticked for you — untick the ones you will not need."
    />
  );
}

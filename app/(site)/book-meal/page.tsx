import type { Metadata } from "next";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { getCurrentUser } from "@/lib/auth";
import { MEALS_ONLY_AUDIENCE } from "@/lib/booking-types";
import { homeForRole } from "@/lib/routes";
import { joinNames, MEAL_NOTICE_RULE, mealTimetable, servingHouses } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { getRules } from "@/lib/settings-server";
import { canBookOnBehalf } from "@/lib/access";
import { REQUESTER_ROLES } from "@/lib/types";

export const metadata: Metadata = { title: "Book meals" };

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
  const [user, houses, rules] = await Promise.all([
    getCurrentUser(),
    getSiteGuestHouses(),
    getRules(),
  ]);
  const canBook =
    user !== null && (REQUESTER_ROLES.includes(user.role) || canBookOnBehalf(user.role));
  const serving = servingHouses(houses);
  const where = joinNames(serving.map((h) => h.name));

  return (
    <SignInPanel
      title="Book meals"
      intro={
        serving.length > 0
          ? `Sign in to place breakfast, lunch or dinner requests. Meals are chosen day by day when you request a room at ${where}; ${MEALS_ONLY_AUDIENCE} can also book meals without a room.`
          : "Meals are not being served at the guest houses at present. You can still sign in to request a room."
      }
      aside={
        serving.length > 0 && (
          <div className="border-t border-ink pt-4">
            <p className="mb-1 text-[12px] font-bold tracking-[0.14em] text-ink uppercase">
              Serving times
            </p>
            <table className="w-full text-[15.5px]">
              <caption className="sr-only">Meal serving times</caption>
              <tbody>
                {mealTimetable(rules).map((row) => (
                  <tr key={row.meal} className="border-b border-border">
                    <th scope="row" className="py-2.5 text-left font-heading text-[19px] font-semibold text-ink">
                      {row.meal}
                    </th>
                    <td className="py-2.5 text-right text-body tabular-nums">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-[14.5px] leading-[1.55] text-muted-foreground">{MEAL_NOTICE_RULE}</p>
          </div>
        )
      }
      user={user}
      continueTo={canBook || !user ? MEAL_BOOKING_PATH : homeForRole(user.role)}
      continueLabel={canBook ? "Continue to booking" : "Go to your portal"}
      next={MEAL_BOOKING_PATH}
      submitLabel="Sign in to book meals"
      footnote="Choose vegetarian or non-vegetarian, and every meal your stay covers is ticked for you — untick the ones you will not need."
    />
  );
}

import type { Metadata } from "next";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { Container, Eyebrow } from "@/components/site/site-ui";
import { getCurrentUser } from "@/lib/auth";
import { MEALS_ONLY_AUDIENCE } from "@/lib/booking-types";
import { homeForRole } from "@/lib/routes";
import { joinNames, mealTimeLines, servingHouses } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { canBookOnBehalf } from "@/lib/access";
import { REQUESTER_ROLES } from "@/lib/types";

export const metadata: Metadata = { title: "Book meal" };

/**
 * Public entry point for meals. Meals are chosen day by day inside the booking
 * request at `/book`, and only at guest houses flagged `serves_meals`. Most
 * requesters add them to a room; `MEALS_ONLY_ROLES` may also book meals with
 * no room (service type `meals_only`). Both go through the same form.
 */
export default async function BookMealPage() {
  const [user, houses] = await Promise.all([getCurrentUser(), getSiteGuestHouses()]);
  const canBook =
    user !== null && (REQUESTER_ROLES.includes(user.role) || canBookOnBehalf(user.role));
  const serving = servingHouses(houses);
  const where = joinNames(serving.map((h) => h.name));

  return (
    <Container className="pt-11 pb-[88px]">
      <SignInPanel
        title="Book meal"
        intro={
          serving.length > 0
            ? `Sign in to place breakfast, lunch or dinner requests for your stay. Meals are chosen day by day when you request a room at ${where}; ${MEALS_ONLY_AUDIENCE} can also book meals without a room.`
            : "Meals are not being served at the guest houses at present. You can still sign in to request a room."
        }
        aside={
          serving.length > 0 && (
            <div className="rounded-[2px] border border-border px-5 py-[18px]">
              <Eyebrow className="mb-2">Serving times</Eyebrow>
              <ul className="space-y-1 text-[15.5px] text-body">
                {mealTimeLines().map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )
        }
        user={user}
        continueTo={canBook || !user ? "/book" : homeForRole(user.role)}
        continueLabel={canBook ? "Continue to booking" : "Go to your portal"}
        next="/book"
        submitLabel="Sign in to book meals"
        footnote="Every meal your stay covers is ticked by default — untick the ones you will not need."
      />
    </Container>
  );
}

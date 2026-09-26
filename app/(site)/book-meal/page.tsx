import type { Metadata } from "next";
import Link from "next/link";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { SIGN_IN_PHOTOS } from "@/lib/site";
import { joinNames, servingHouses } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { canBookOnBehalf } from "@/lib/access";
import { REQUESTER_ROLES } from "@/lib/types";

export const metadata: Metadata = { title: "Book meals" };

/** The booking form's meals door — see `app/(portal)/book/page.tsx`. */
const MEAL_BOOKING_PATH = "/book?service=meals_only";

/**
 * Public entry point for meals.
 *
 * It opens the booking form on `?service=meals_only`, which is the same door
 * the portal home offers. The form falls back to the ordinary room flow for a
 * requester whose role cannot book meals without a room — for them meals are
 * part of a room booking, chosen day by day. Meal times and the kitchen's
 * notice are on the Guidelines page, not here (the owner, 26 Sep 2026).
 */
export default async function BookMealPage() {
  const [user, houses] = await Promise.all([getCurrentUser(), getSiteGuestHouses()]);
  const canBook =
    user !== null && (REQUESTER_ROLES.includes(user.role) || canBookOnBehalf(user.role));
  const serving = servingHouses(houses);
  const where = joinNames(serving.map((h) => h.name));

  return (
    <SignInPanel
      title="Book meals"
      intro={
        serving.length > 0
          ? `Sign in to book meals at ${where}.`
          : "Meals are not being served at the guest houses at present. You can still sign in to request a room."
      }
      photo={SIGN_IN_PHOTOS.bookMeal}
      user={user}
      continueTo={canBook || !user ? MEAL_BOOKING_PATH : homeForRole(user.role)}
      continueLabel={canBook ? "Continue to booking" : "Go to your portal"}
      next={MEAL_BOOKING_PATH}
      submitLabel="Sign in to book meals"
      footnote={
        <>
          Meal times are in the{" "}
          <Link href="/guidelines#meals" className="font-semibold text-ink underline decoration-vermilion underline-offset-4">
            guidelines
          </Link>
          .
        </>
      }
    />
  );
}

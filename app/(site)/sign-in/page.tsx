import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { PHOTOS } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The general sign-in page — where every portal guard sends a signed-out
 * visitor (`SIGN_IN_PATH`), and the header's "Sign in" link. Unlike the two
 * booking entry points it lands each role on its own home.
 */
export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));

  return (
    <SignInPanel
      title="Welcome to the booking portal"
      photo={PHOTOS.courtyard}
      intro="Raise and track booking requests, review requests awaiting your approval, or run the guest house desk."
      user={null}
      continueTo="/"
      continueLabel=""
    />
  );
}

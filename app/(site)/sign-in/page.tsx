import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The general sign-in page - where every portal guard sends a signed-out
 * visitor (`SIGN_IN_PATH`), and the header's "Sign in" link. Unlike the two
 * booking entry points it lands each role on its own home.
 *
 * **No photograph beside it since 27 Oct 2026** (the owner: "remove the image
 * currently displayed on the right side of the sign-in portal... centre-align
 * the sign-in content"), so all three doors are the same centred panel.
 * `SIGN_IN_PHOTOS` is kept - every one of those photographs is in the Gallery
 * too, and putting one back is one prop.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  const { error } = await searchParams;
  if (user) redirect(homeForRole(user.role));

  return (
    <SignInPanel
      title="Sign in"
      intro="Sign in with your institute account to book and follow your stays."
      user={null}
      continueTo="/"
      continueLabel=""
      notice={error ? error.slice(0, 200) : null}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { PAGE_PHOTOS } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The general sign-in page — where every portal guard sends a signed-out
 * visitor (`SIGN_IN_PATH`), and the header's "Sign in" link. Unlike the two
 * booking entry points it lands each role on its own home.
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
      intro="Sign in to book and follow your stays."
      photo={PAGE_PHOTOS.signIn}
      user={null}
      continueTo="/"
      continueLabel=""
      notice={error ? error.slice(0, 200) : null}
    />
  );
}

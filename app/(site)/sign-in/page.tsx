import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/site/sign-in-panel";
import { Container } from "@/components/site/site-ui";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";

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
    <Container className="pt-11 pb-[88px]">
      <SignInPanel
        title="Sign in"
        intro="Sign in to the guest house portal to raise and track booking requests, review requests awaiting your approval, or run the guest house desk."
        user={null}
        continueTo="/"
        continueLabel=""
      />
    </Container>
  );
}

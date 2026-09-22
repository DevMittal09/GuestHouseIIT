import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit-server";
import { appUrl, googleOauth } from "@/lib/env";
import { completeGoogleSignIn } from "@/lib/oidc";
import { homeForRole } from "@/lib/routes";
import { startSession } from "@/lib/sessions";
import { isInstituteEmail, LOGIN_DOMAIN } from "@/lib/site";
import { getStore } from "@/lib/store";
import { OAUTH_COOKIE } from "../start/route";

export const dynamic = "force-dynamic";

function back(message: string, base: string): Response {
  return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(message)}`, base));
}

/**
 * Leg two: verify the state, exchange the code with the PKCE verifier, check
 * the identity token, and only then start a session — and only for a verified
 * institute address that already has a portal account. Everything else goes
 * back to the sign-in page with a sentence the visitor can act on.
 */
export async function GET(request: Request): Promise<Response> {
  const base = appUrl() ?? new URL(request.url).origin;
  const config = googleOauth();
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);
  if (!config || !raw) return back("Sign-in timed out — please try again.", base);

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return back(error === "access_denied" ? "Sign-in was cancelled." : "Google could not sign you in.", base);

  let remembered: { state: string; verifier: string; nonce: string; next: string | null };
  try {
    remembered = JSON.parse(raw);
  } catch {
    return back("Sign-in timed out — please try again.", base);
  }
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== remembered.state) {
    return back("That sign-in did not match the one that was started — please try again.", base);
  }

  let identity;
  try {
    identity = await completeGoogleSignIn(config, { code, verifier: remembered.verifier, nonce: remembered.nonce });
  } catch (e) {
    console.error("[auth] Google sign-in failed:", e);
    return back("Google could not sign you in — please try again.", base);
  }

  if (!identity.emailVerified) return back("That Google account's email address is not verified.", base);
  // Both the hosted-domain claim and the address itself: `hd` proves the
  // account belongs to the institute's Workspace, and the address rule also
  // admits the student subdomain.
  if (!isInstituteEmail(identity.email) || (identity.hostedDomain !== null && !isInstituteEmail(`x@${identity.hostedDomain}`))) {
    await recordAudit(null, "signin.failure", identity.email, { method: "google", reason: "not an institute account" });
    return back(`Use your @${LOGIN_DOMAIN} account — personal Google accounts cannot sign in.`, base);
  }

  const profile = (await getStore().listProfiles()).find((p) => p.email.toLowerCase() === identity.email);
  if (!profile) {
    await recordAudit(null, "signin.failure", identity.email, { method: "google", reason: "no portal account" });
    return back("That account is not registered on the guest house portal. Please contact the guest house office.", base);
  }

  await startSession(profile.id);
  await recordAudit(profile, "signin.success", profile.email, { method: "google" });
  return NextResponse.redirect(new URL(remembered.next ?? homeForRole(profile.role), base));
}

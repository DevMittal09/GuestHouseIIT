import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, googleOauth } from "@/lib/env";
import { startGoogleSignIn, OAUTH_COOKIE } from "@/lib/oidc";
import { RATE_LIMITS } from "@/lib/security";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";


/**
 * Leg one of Google sign-in: mint state + PKCE, remember them in an httpOnly
 * cookie, and send the browser to Google restricted to the institute domain.
 */
export async function GET(request: Request): Promise<Response> {
  const config = googleOauth();
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?error=google-not-configured", appUrl() ?? request.url));
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  try {
    const gate = await getStore().hitRateLimit(`oauth:${ip}`, RATE_LIMITS.oauth.limit, RATE_LIMITS.oauth.windowSeconds);
    if (!gate.allowed) {
      return new NextResponse("Too many sign-in attempts - wait a minute and try again.", {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfter) },
      });
    }
  } catch (e) {
    console.warn("[security] OAuth rate-limit check failed — allowing request through.", e);
  }

  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  // "*" is any Workspace account, so students on smail are offered theirs whether
  // or not it is the same Workspace as iitpkd.ac.in, and personal Gmail is not.
  // It is a hint: the callback checks the address and the claim on the way back.
  const start = startGoogleSignIn(config, { hostedDomain: "*" });
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, JSON.stringify({ state: start.state, verifier: start.verifier, nonce: start.nonce, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(start.url);
}

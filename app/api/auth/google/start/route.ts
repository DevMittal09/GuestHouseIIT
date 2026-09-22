import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, googleOauth } from "@/lib/env";
import { startGoogleSignIn } from "@/lib/oidc";
import { RATE_LIMITS } from "@/lib/security";
import { LOGIN_DOMAIN, safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Where the state, verifier and nonce live between the two legs, for 10 minutes. */
export const OAUTH_COOKIE = "gh_oauth";

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
      return new NextResponse("Too many sign-in attempts — wait a minute and try again.", {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfter) },
      });
    }
  } catch {
    // No throttle table yet (migration 21): let the sign-in through.
  }

  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const start = startGoogleSignIn(config, { hostedDomain: LOGIN_DOMAIN });
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, JSON.stringify({ state: start.state, verifier: start.verifier, nonce: start.nonce, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(start.url);
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, googleOauth, isProduction } from "@/lib/env";
import { startGoogleSignIn, OAUTH_COOKIE } from "@/lib/oidc";
import { RATE_LIMITS } from "@/lib/security";
import { LOGIN_DOMAIN, safeNextPath } from "@/lib/site";
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
  const start = startGoogleSignIn(config, { hostedDomain: LOGIN_DOMAIN });
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

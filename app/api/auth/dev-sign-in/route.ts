import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { homeForRole } from "@/lib/routes";
import { startSession } from "@/lib/sessions";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Test-only sign-in endpoint for e2e tests.
 *
 * Accepts email + password via POST and starts a session, returning a redirect.
 * Only available when `ALLOW_MOCK_STORE` is set (the e2e and dev environment) -
 * never in production. This exists because the UI now shows only "Sign in with
 * Google", which Playwright cannot drive through the real OAuth flow.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.ALLOW_MOCK_STORE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const body = (await request.json()) as { email?: string; password?: string; next?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const profile = await getStore().getProfileByEmail(email);
  if (!profile || !profile.password_hash) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, profile.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  await startSession(profile.id);
  return NextResponse.json({ ok: true, redirect: body.next ?? homeForRole(profile.role) });
}

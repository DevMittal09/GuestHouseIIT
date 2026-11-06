import { NextResponse } from "next/server";
import { homeForRole } from "@/lib/routes";
import { startSession } from "@/lib/sessions";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Test-only sign-in endpoint for the e2e suite.
 *
 * Accepts an email and a shared secret, looks up the profile, and starts a
 * session - no password needed. Available only when `E2E_TEST_SECRET` is set
 * in the environment and the request carries the same value. The Playwright
 * config sets the secret; a real deployment never does.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const body = (await request.json()) as { email?: string; secret?: string; next?: string };
  if (!body.secret || body.secret !== secret) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const profile = await getStore().getProfileByEmail(email);
  if (!profile) {
    return NextResponse.json({ error: "Unknown account" }, { status: 401 });
  }

  await startSession(profile.id);
  return NextResponse.json({ ok: true, redirect: body.next ?? homeForRole(profile.role) });
}

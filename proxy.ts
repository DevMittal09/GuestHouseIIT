import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers for every response (Phase 8). Next 16 calls this file the
 * proxy; it is the old middleware, run before each request is handled.
 *
 * The **Content-Security-Policy carries a nonce**, minted per request and
 * handed to Next through the `x-nonce` request header, which Next puts on the
 * scripts it emits. `strict-dynamic` then lets those scripts load their own
 * chunks while anything injected into the page stays blocked.
 *
 * What the allowances are for:
 * - `style-src 'unsafe-inline'`: the charts position bars with `style=`
 *   attributes, which a nonce cannot cover.
 * - `frame-src` Google Maps: the Contact page embeds the institute's own pin.
 * - `img-src data:`/`blob:`: the invoice preview and the PDF download.
 * - `connect-src` Supabase: the browser talks to it directly for realtime.
 * - fonts are self-hosted by `next/font`, so `font-src 'self'` is enough.
 *
 * Portal pages also get `X-Robots-Tag: noindex`: the booking portal and the
 * console must never appear in a search engine.
 */

const PORTAL_PREFIXES = [
  "/admin",
  "/manager",
  "/caretaker",
  "/dashboard",
  "/book",
  "/history",
  "/warden",
  "/fa",
  "/hod",
  "/iar",
  "/approvals",
  "/availability",
  "/api",
  "/mock-login",
];

function contentSecurityPolicy(nonce: string, isProduction: boolean): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    // `strict-dynamic` makes the host list below irrelevant in modern
    // browsers; it is there for ones that do not understand it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: ${isProduction ? "" : "'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase}`.trim(),
    "frame-src https://www.google.com https://maps.google.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const isProduction = process.env.NODE_ENV === "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const headers = response.headers;
  headers.set("Content-Security-Policy", contentSecurityPolicy(nonce, isProduction));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  // Two years, subdomains included. Only in production: an HSTS header from a
  // local build would pin http://localhost to HTTPS in the browser.
  if (isProduction) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  const path = request.nextUrl.pathname;
  if (PORTAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  // Everything but Next's own static output and the icons — those are public,
  // cached files with no user data in them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|.well-known).*)"],
};

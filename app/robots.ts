import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

/**
 * The public site may be indexed; the portal and the console may not (Phase
 * 8). `proxy.ts` sets `X-Robots-Tag: noindex` on those paths as well, so a
 * crawler that ignores this file still gets told.
 */
export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
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
          "/sign-in",
        ],
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml`, host: base } : {}),
  };
}

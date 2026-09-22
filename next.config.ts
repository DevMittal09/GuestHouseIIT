import type { NextConfig } from "next";
import { appUrl } from "./lib/env";

const nextConfig: NextConfig = {
  // Nodemailer resolves transports with dynamic requires and reaches for Node
  // built-ins (net, tls, dns), which the Server Components bundler cannot
  // follow. It is not on Next's built-in externals list, so name it here and
  // let plain `require` load it at runtime.
  // ldapts (LDAP sign-in) is the same kind of package: raw sockets and TLS.
  serverExternalPackages: ["nodemailer", "ldapts"],
  // The framework's version is not something a visitor needs to know.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Server actions are accepted only from the site's own origin (Phase 8).
      // Without this, a deployment behind a proxy that rewrites Host can be
      // talked into accepting an action from elsewhere.
      ...(appUrl() ? { allowedOrigins: [new URL(appUrl()!).host] } : {}),
      // Booking submissions carry ID-document / alumni-card uploads
      // (up to 5 MB per file); the 1 MB default rejects them with a
      // browser-side NetworkError.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

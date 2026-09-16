import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nodemailer resolves transports with dynamic requires and reaches for Node
  // built-ins (net, tls, dns), which the Server Components bundler cannot
  // follow. It is not on Next's built-in externals list, so name it here and
  // let plain `require` load it at runtime.
  serverExternalPackages: ["nodemailer"],
  experimental: {
    serverActions: {
      // Booking submissions carry ID-document / alumni-card uploads
      // (up to 5 MB per file); the 1 MB default rejects them with a
      // browser-side NetworkError.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

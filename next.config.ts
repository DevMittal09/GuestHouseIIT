import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

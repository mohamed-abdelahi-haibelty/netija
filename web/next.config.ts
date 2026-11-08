import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "path";

// Load root .env so Next.js picks up shared variables (API_URL, keys, etc.)
// override: false means process-level env vars (Docker, CI) always win.
config({ path: path.resolve(process.cwd(), "../.env"), override: false });

const nextConfig: NextConfig = {
  // Inlines the Tailwind stylesheet into <head> instead of a render-blocking
  // <link> tag. Fits this site's traffic shape (results-day = mostly
  // first-time visitors who wouldn't have a cached stylesheet anyway) and
  // its CSS is small/atomic (Tailwind) — exactly the trade-off this flag is
  // meant for (Next.js docs: inlineCss.md).
  experimental: {
    inlineCss: true,
  },
  // /public assets aren't content-hashed, so Next.js doesn't cache them
  // immutably by default. The earlier 30-day value still left PageSpeed's
  // "efficient cache lifetimes" audit flagging logo-2.png/icon.svg/
  // apple-icon.png (fetched on essentially every fresh visit as favicon/
  // touch-icon requests) — Lighthouse only gives full credit at a 1-year
  // TTL. These assets change rarely and only via an admin-initiated
  // redeploy, so a year-long cache (matching Next's own treatment of
  // content-hashed /_next/static assets) is the right trade: if one is
  // ever swapped without a filename change, purge it from Cloudflare's
  // cache manually (same manual step already used for other rare
  // out-of-band asset changes) rather than accepting a permanent
  // performance-score cost for a hypothetical.
  headers() {
    return Promise.resolve([
      {
        source: "/:path*.(png|jpg|jpeg|gif|svg|webp|avif|ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ]);
  },
};

export default nextConfig;

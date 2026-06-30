import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "path";

// Load root .env so Next.js picks up shared variables (API_URL, keys, etc.)
// override: false means process-level env vars (Docker, CI) always win.
config({ path: path.resolve(process.cwd(), "../.env"), override: false });

const nextConfig: NextConfig = {};

export default nextConfig;

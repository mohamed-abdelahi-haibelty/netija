import { apiRequest, ApiClientError, DEFAULT_RATE_LIMIT_RETRY_SECONDS } from "@/lib/api";
import type { StudentResult } from "shared";

export type FetchResultOutcome =
  | { kind: "ok"; data: StudentResult }
  | { kind: "not_found" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

// error-handling.md: "Expected API errors are rendered as states, not
// thrown." STUDENT_NOT_FOUND/VALIDATION_ERROR and RATE_LIMITED are expected
// outcomes for this route and resolve to a state here instead of throwing —
// only a genuinely unexpected failure (network error, 5xx, an ApiClientError
// code we don't recognize) escapes as a thrown Error for the route's
// error.tsx boundary to catch.
export async function fetchResult(slug: string): Promise<FetchResultOutcome> {
  try {
    const data = await apiRequest<StudentResult>(
      `/api/results/${encodeURIComponent(slug)}`,
      { next: { revalidate: 3600 } },
      // Server-side call: use the internal Docker-network address to skip
      // the Cloudflare/Caddy round-trip. Safe to switch (doesn't collide
      // with rate limiting) because api/src/lib/rateLimit.ts already
      // exempts header-less requests on the 'results' route class - see
      // progress-tracker.md, 2026-07-12.
      process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL,
    );
    return { kind: "ok", data };
  } catch (err) {
    if (err instanceof ApiClientError) {
      if (err.code === "STUDENT_NOT_FOUND" || err.code === "VALIDATION_ERROR") {
        return { kind: "not_found" };
      }
      if (err.code === "RATE_LIMITED") {
        return {
          kind: "rate_limited",
          retryAfterSeconds: err.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_RETRY_SECONDS,
        };
      }
    }
    throw err;
  }
}

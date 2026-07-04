import type { ApiSuccessResponse, ApiErrorResponse } from 'shared';

// Fallback used when a RATE_LIMITED error arrives without a parseable
// Retry-After header — matches the api's rate-limit window (see
// api/src/lib/rateLimit.ts) so the countdown shown to the user is never
// wildly wrong even in that edge case.
export const DEFAULT_RATE_LIMIT_RETRY_SECONDS = 60;

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const url = `${baseUrl}${path}`;

  const mergedHeaders = new Headers({ 'Content-Type': 'application/json' });
  if (options?.headers) {
    new Headers(options.headers).forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }

  const res = await fetch(url, { ...options, headers: mergedHeaders });

  if (!res.ok) {
    const body = (await res.json()) as ApiErrorResponse;
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfterSeconds =
      retryAfterHeader !== null && Number.isFinite(Number(retryAfterHeader))
        ? Number(retryAfterHeader)
        : undefined;
    throw new ApiClientError(body.error.code, body.error.message, retryAfterSeconds);
  }

  const body = (await res.json()) as ApiSuccessResponse<T>;
  return body.data;
}

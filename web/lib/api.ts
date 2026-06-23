import type { ApiSuccessResponse, ApiErrorResponse } from 'shared';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
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
    throw new ApiClientError(body.error.code, body.error.message);
  }

  const body = (await res.json()) as ApiSuccessResponse<T>;
  return body.data;
}

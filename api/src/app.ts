import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './types.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { auth } from './lib/auth.js';
import healthRouter from './routes/health.js';
import searchRouter from './routes/search.js';
import resultsRouter from './routes/results.js';
import importsRouter from './routes/imports.js';

const STATUS_TO_CODE: Partial<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'FILE_TOO_LARGE',
  415: 'UNSUPPORTED_FILE_TYPE',
  422: 'MISSING_REQUIRED_COLUMNS',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(requestId);
  app.use(requestLogger);
  app.use(secureHeaders());
  // credentials:true lets Better Auth set/read the session cookie cross-origin
  app.use(
    cors({
      origin: process.env['WEB_URL'] ?? 'http://localhost:3000',
      credentials: true,
    }),
  );

  // Block public sign-up — admin accounts are created via `npm run auth:create-admin`.
  // All other /api/auth/** routes (sign-in, get-session, sign-out) pass through to
  // Better Auth. This check runs before the wildcard handler below.
  app.post('/api/auth/sign-up/email', (c) =>
    c.json({ error: { code: 'FORBIDDEN', message: 'Registration is not open.' } }, 403),
  );

  // Delegate all other auth traffic to Better Auth.
  // Hono's * wildcard matches slashes, so this covers /api/auth/sign-in/email, etc.
  app.on(
    ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    '/api/auth/*',
    (c) => auth.handler(c.req.raw),
  );

  app.route('/health', healthRouter);
  app.route('/api/search', searchRouter);
  app.route('/api/results', resultsRouter);
  app.route('/api/imports', importsRouter);

  app.onError((err, c) => {
    const rid = c.get('requestId');
    if (err instanceof HTTPException) {
      const causeCode =
        err.cause !== null &&
        typeof err.cause === 'object' &&
        'code' in err.cause &&
        typeof err.cause.code === 'string'
          ? err.cause.code
          : undefined;
      const code = causeCode ?? STATUS_TO_CODE[err.status] ?? 'INTERNAL';
      return c.json({ error: { code, message: err.message } }, err.status);
    }
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'unexpected error',
        requestId: rid,
        path: c.req.path,
        method: c.req.method,
      }),
    );
    Sentry.captureException(err, {
      extra: { path: c.req.path, method: c.req.method, requestId: rid },
    });
    return c.json({ error: { code: 'INTERNAL', message: 'Internal Server Error' } }, 500);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404),
  );

  return app;
}

export default createApp();

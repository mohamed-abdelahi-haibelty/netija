import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './types.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import healthRouter from './routes/health.js';

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
  app.use(
    cors({
      origin: process.env['WEB_URL'] ?? 'http://localhost:3000',
    }),
  );

  app.route('/health', healthRouter);

  app.onError((err, c) => {
    const rid = c.get('requestId');
    if (err instanceof HTTPException) {
      const code = STATUS_TO_CODE[err.status] ?? 'INTERNAL';
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
    return c.json({ error: { code: 'INTERNAL', message: 'Internal Server Error' } }, 500);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404),
  );

  return app;
}

export default createApp();

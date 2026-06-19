import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'request completed',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: Date.now() - start,
      requestId: c.get('requestId'),
    }),
  );
});

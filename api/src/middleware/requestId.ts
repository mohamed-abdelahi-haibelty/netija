import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const id = crypto.randomUUID();
  c.set('requestId', id);
  await next();
  c.header('X-Request-Id', id);
});

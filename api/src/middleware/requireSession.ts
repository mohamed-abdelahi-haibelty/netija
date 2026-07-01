import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { auth } from '../lib/auth.js';
import type { AppEnv } from '../types.js';

/**
 * Validates the Better Auth session cookie on every request.
 * Returns 401 UNAUTHENTICATED if no valid session exists.
 * Stores the session on c.var.session for downstream handlers.
 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new HTTPException(401, { message: 'Unauthenticated' });
  }
  c.set('session', session);
  await next();
});

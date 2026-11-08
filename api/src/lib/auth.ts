import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.js';
import { authUser, authSession, authAccount, authVerification } from '../db/schema.js';

const secret = process.env['BETTER_AUTH_SECRET'];
if (!secret) throw new Error('BETTER_AUTH_SECRET environment variable is required');

const webUrl = process.env['WEB_URL'] ?? 'http://localhost:3000';
// The web app (netija.com) and the api (api.netija.com) are separate
// subdomains, so the session cookie needs an explicit parent-domain scope
// or the browser never sends it back to the web app after login.
// No-op on localhost, where there's no shared parent domain to scope to.
const cookieDomain = new URL(webUrl).hostname.replace(/^www\./, '');

export const auth = betterAuth({
  secret,
  baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3001',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
  emailAndPassword: { enabled: true },
  // Allow the web frontend and the API itself as trusted origins for CORS + cookie handling
  trustedOrigins: [
    process.env['WEB_URL'] ?? 'http://localhost:3000',
    process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3001',
  ],
  advanced: {
    crossSubDomainCookies: {
      enabled: cookieDomain !== 'localhost',
      domain: `.${cookieDomain}`,
    },
  },
});

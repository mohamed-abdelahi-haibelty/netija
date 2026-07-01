import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.js';
import { authUser, authSession, authAccount, authVerification } from '../db/schema.js';

const secret = process.env['BETTER_AUTH_SECRET'];
if (!secret) throw new Error('BETTER_AUTH_SECRET environment variable is required');

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
});

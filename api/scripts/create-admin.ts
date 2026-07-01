/**
 * Creates or verifies an admin user from environment variables.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret npm run auth:create-admin
 *
 * Idempotent: exits 0 without error if the user already exists.
 * Run this once after first deploying, or to provision a new environment.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../.env') });

import { auth } from '../src/lib/auth.js';

async function main() {
  const email = process.env['ADMIN_EMAIL'];
  const password = process.env['ADMIN_PASSWORD'];
  const name = process.env['ADMIN_NAME'] ?? 'Admin';

  if (!email || !password) {
    console.error('Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
    process.exit(1);
  }

  try {
    await auth.api.signUpEmail({
      body: { email, password, name },
    });
    console.log(`Admin created: ${email}`);
    process.exit(0);
  } catch (err: unknown) {
    // Better Auth throws when the email is already registered.
    // Any "already exists" condition is treated as success for idempotency.
    const code =
      err !== null && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    const message =
      err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

    if (code === 'USER_ALREADY_EXISTS' || message.includes('already')) {
      console.log(`Admin already exists: ${email}`);
      process.exit(0);
    }

    console.error('Failed to create admin:', err);
    process.exit(1);
  }
}

main();

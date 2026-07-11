// A cwd-relative fallback only makes sense in local dev, where every
// process is started with api/ as cwd (npm workspace scripts do this). In
// production the cwd is whatever the container/host happens to use, so the
// same fallback can silently resolve to a plausible-looking but wrong path
// instead of the real shared volume. Fail loudly at startup instead.
export function requiredPathEnv(varName: string, devFallback: string): string {
  const value = process.env[varName];
  if (value) return value;
  if (process.env['APP_ENV'] === 'production') {
    throw new Error(
      `${varName} must be set in production — refusing to fall back to a cwd-relative default.`,
    );
  }
  return devFallback;
}

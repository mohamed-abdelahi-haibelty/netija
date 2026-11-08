import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requiredPathEnv } from '../lib/env.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('requiredPathEnv', () => {
  it('returns the env var value when set, regardless of APP_ENV', () => {
    process.env['SOME_DIR'] = '/configured/path';
    process.env['APP_ENV'] = 'production';
    expect(requiredPathEnv('SOME_DIR', '/dev/fallback')).toBe('/configured/path');
  });

  it('returns the dev fallback when unset and APP_ENV is not production', () => {
    delete process.env['SOME_DIR'];
    delete process.env['APP_ENV'];
    expect(requiredPathEnv('SOME_DIR', '/dev/fallback')).toBe('/dev/fallback');
  });

  it('throws instead of silently falling back when unset in production', () => {
    delete process.env['SOME_DIR'];
    process.env['APP_ENV'] = 'production';
    expect(() => requiredPathEnv('SOME_DIR', '/dev/fallback')).toThrow(/SOME_DIR must be set/);
  });
});

import type { Context } from 'hono';

interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

interface ValidationFailure {
  success: false;
  error: { issues: ValidationIssue[] };
}

interface ValidationSuccess {
  success: true;
}

/**
 * Shared zValidator error-response hook. Every route in this codebase
 * returns the identical VALIDATION_ERROR shape (error-handling.md) on a
 * failed validation — only the `message` differs per endpoint/target.
 */
export function validationErrorHook(message: string) {
  return (result: ValidationSuccess | ValidationFailure, c: Context) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message,
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
        400,
      );
    }
  };
}

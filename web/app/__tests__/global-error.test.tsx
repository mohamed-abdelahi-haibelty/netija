import { render, screen, waitFor } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import GlobalError from '../global-error';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const mockCaptureException = jest.mocked(Sentry.captureException);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('app/global-error.tsx (error-handling.md: unexpected fetch failures captured by Sentry)', () => {
  it('reports the error to Sentry — a React error boundary would otherwise hide it from window.onerror', async () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<GlobalError error={error} unstable_retry={() => {}} />);

    // captureException now runs after a dynamic import() of @sentry/nextjs
    // (kept out of every route's eager bundle — see global-error.tsx).
    await waitFor(() => { expect(mockCaptureException).toHaveBeenCalledWith(error); });
  });

  it('still renders the friendly bilingual error state with the digest', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<GlobalError error={error} unstable_retry={() => {}} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });
});

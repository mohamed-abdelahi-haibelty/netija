import { render, screen } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import GlobalError from '../global-error';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const mockCaptureException = jest.mocked(Sentry.captureException);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('app/global-error.tsx (error-handling.md: unexpected fetch failures captured by Sentry)', () => {
  it('reports the error to Sentry — a React error boundary would otherwise hide it from window.onerror', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<GlobalError error={error} unstable_retry={() => {}} />);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('still renders the friendly bilingual error state with the digest', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<GlobalError error={error} unstable_retry={() => {}} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });
});

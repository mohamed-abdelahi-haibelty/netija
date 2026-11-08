import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { ApiClientError } from '@/lib/api';
import { FlushCacheDialog } from '../FlushCacheDialog';

expect.extend(toHaveNoViolations);

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

function renderDialog(overrides?: Partial<Parameters<typeof FlushCacheDialog>[0]>) {
  const onClose = jest.fn();
  const onFlushed = jest.fn();
  const utils = render(
    <I18nProvider locale="fr">
      <FlushCacheDialog open={true} onClose={onClose} onFlushed={onFlushed} {...overrides} />
    </I18nProvider>,
  );
  return { onClose, onFlushed, ...utils };
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('FlushCacheDialog', () => {
  it('renders nothing when not open', () => {
    render(
      <I18nProvider locale="fr">
        <FlushCacheDialog open={false} onClose={jest.fn()} onFlushed={jest.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is axe-clean', async () => {
    const { container } = renderDialog();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('calls onClose on Cancel without calling the flush endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('closes on Escape without calling the flush endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('flushes the whole result cache with an empty body when no pattern is given', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ deletedCount: 12 });
    const { onFlushed } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Flush' }));

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/cache/flush',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    );
    await waitFor(() => {
      expect(onFlushed).toHaveBeenCalledWith({ deletedCount: 12 });
    });
  });

  it('flushes only the matching pattern when one is given, and shows it in the body', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ deletedCount: 3 });
    const { onFlushed } = renderDialog({ pattern: 'exam:2024:*' });

    expect(screen.getByText(/exam:2024:\*/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Flush' }));

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/cache/flush',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pattern: 'exam:2024:*' }) }),
    );
    await waitFor(() => {
      expect(onFlushed).toHaveBeenCalledWith({ deletedCount: 3 });
    });
  });

  it('shows the server error message and does not call onFlushed on failure', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new ApiClientError('INTERNAL', 'something broke'));
    const { onFlushed } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Flush' }));

    expect(await screen.findByText('something broke')).toBeInTheDocument();
    expect(onFlushed).not.toHaveBeenCalled();
  });
});

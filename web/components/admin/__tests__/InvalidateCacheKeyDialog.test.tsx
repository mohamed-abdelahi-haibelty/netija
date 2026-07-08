import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import { InvalidateCacheKeyDialog } from '../InvalidateCacheKeyDialog';

expect.extend(toHaveNoViolations);

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

function renderDialog(overrides?: Partial<Parameters<typeof InvalidateCacheKeyDialog>[0]>) {
  const onClose = jest.fn();
  const onInvalidated = jest.fn();
  const utils = render(
    <I18nProvider locale="fr">
      <InvalidateCacheKeyDialog
        cacheKey="result:abc123"
        onClose={onClose}
        onInvalidated={onInvalidated}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onClose, onInvalidated, ...utils };
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('InvalidateCacheKeyDialog', () => {
  it('renders nothing when no key is targeted', () => {
    render(
      <I18nProvider locale="fr">
        <InvalidateCacheKeyDialog cacheKey={null} onClose={jest.fn()} onInvalidated={jest.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is axe-clean', async () => {
    const { container } = renderDialog();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows the targeted key in the confirmation body', () => {
    renderDialog();
    expect(screen.getByText(/result:abc123/)).toBeInTheDocument();
  });

  it('calls onClose on Cancel without calling the invalidate endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('closes on Escape without calling the invalidate endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('calls DELETE on the encoded key and onInvalidated on confirm', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ deleted: true });
    const { onInvalidated } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Invalidate' }));

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/cache/keys/result%3Aabc123',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await waitFor(() => {
      expect(onInvalidated).toHaveBeenCalledWith('result:abc123');
    });
  });

  it('shows the server error message and does not call onInvalidated on failure', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new ApiClientError('CACHE_KEY_OUT_OF_SCOPE', 'out of scope'));
    const { onInvalidated } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Invalidate' }));

    expect(await screen.findByText('out of scope')).toBeInTheDocument();
    expect(onInvalidated).not.toHaveBeenCalled();
  });
});

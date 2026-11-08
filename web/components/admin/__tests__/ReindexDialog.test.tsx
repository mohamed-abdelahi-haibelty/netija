import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { ApiClientError } from '@/lib/api';
import { ReindexDialog } from '../ReindexDialog';

expect.extend(toHaveNoViolations);

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

function renderDialog(overrides?: Partial<Parameters<typeof ReindexDialog>[0]>) {
  const onClose = jest.fn();
  const onReindexed = jest.fn();
  const utils = render(
    <I18nProvider locale="fr">
      <ReindexDialog open={true} onClose={onClose} onReindexed={onReindexed} {...overrides} />
    </I18nProvider>,
  );
  return { onClose, onReindexed, ...utils };
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('ReindexDialog', () => {
  it('renders nothing when not open', () => {
    render(
      <I18nProvider locale="fr">
        <ReindexDialog open={false} onClose={jest.fn()} onReindexed={jest.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is axe-clean', async () => {
    const { container } = renderDialog();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('calls onClose on the dismiss button without ever calling the reindex endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('closes on Escape without calling the reindex endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('calls the reindex endpoint and onReindexed with the result once confirmed', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ documentCount: 123 });
    const { onReindexed } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Reindex' }));

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/search-index/reindex',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => {
      expect(onReindexed).toHaveBeenCalledWith({ documentCount: 123 });
    });
  });

  it('shows the server error message and does not call onReindexed on failure', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new ApiClientError('INTERNAL', 'something broke'));
    const { onReindexed } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Reindex' }));

    expect(await screen.findByText('something broke')).toBeInTheDocument();
    expect(onReindexed).not.toHaveBeenCalled();
  });
});

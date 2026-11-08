import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { ApiClientError } from '@/lib/api';
import { DeleteAttemptsDialog } from '../DeleteAttemptsDialog';
import type { DeleteAttemptsTarget } from '../DeleteAttemptsDialog';

expect.extend(toHaveNoViolations);

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

const SINGLE_TARGET: DeleteAttemptsTarget = { importId: 42, attemptIds: [7] };
const BULK_TARGET: DeleteAttemptsTarget = { importId: 42, attemptIds: [7, 8, 9] };

function renderDialog(overrides?: Partial<Parameters<typeof DeleteAttemptsDialog>[0]>) {
  const onClose = jest.fn();
  const onDeleted = jest.fn();
  const utils = render(
    <I18nProvider locale="fr">
      <DeleteAttemptsDialog target={SINGLE_TARGET} onClose={onClose} onDeleted={onDeleted} {...overrides} />
    </I18nProvider>,
  );
  return { onClose, onDeleted, ...utils };
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('DeleteAttemptsDialog', () => {
  it('renders nothing when there is no target', () => {
    render(
      <I18nProvider locale="fr">
        <DeleteAttemptsDialog target={null} onClose={jest.fn()} onDeleted={jest.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is axe-clean for a single-row target', async () => {
    const { container } = renderDialog();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('is axe-clean for a bulk target', async () => {
    const { container } = renderDialog({ target: BULK_TARGET });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows singular copy for a single-row target', () => {
    renderDialog({ target: SINGLE_TARGET });
    expect(screen.getByRole('heading', { name: 'Delete row' })).toBeInTheDocument();
  });

  it('shows the count for a bulk target', () => {
    renderDialog({ target: BULK_TARGET });
    expect(screen.getByRole('heading', { name: 'Delete 3 rows' })).toBeInTheDocument();
    expect(screen.getByText(/3 selected rows/)).toBeInTheDocument();
  });

  it('calls onClose on Cancel without calling the delete endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('closes on Escape without calling the delete endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('calls the delete endpoint with the given ids and onDeleted with the result', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ deletedAttempts: 3 });
    const { onDeleted } = renderDialog({ target: BULK_TARGET });

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/imports/42/attempts',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ attemptIds: [7, 8, 9] }),
      }),
    );
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith({ deletedAttempts: 3 });
    });
  });

  it('shows the server error message and does not call onDeleted on failure', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new ApiClientError('IMPORT_PROCESSING', 'still processing'));
    const { onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('still processing')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

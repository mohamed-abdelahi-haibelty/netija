import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import { DeleteImportDialog } from '../DeleteImportDialog';
import type { DeleteImportTarget } from '../DeleteImportDialog';

expect.extend(toHaveNoViolations);

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => {
  class MockApiClientError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'ApiClientError';
    }
  }
  return {
    apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
    ApiClientError: MockApiClientError,
  };
});

const TARGET: DeleteImportTarget = {
  id: 42,
  originalFilename: 'bac_2024.xlsx',
  examYear: 2024,
  attemptCount: 4980,
};

function renderDialog(overrides?: Partial<Parameters<typeof DeleteImportDialog>[0]>) {
  const onClose = jest.fn();
  const onDeleted = jest.fn();
  const utils = render(
    <I18nProvider locale="fr">
      <DeleteImportDialog target={TARGET} onClose={onClose} onDeleted={onDeleted} {...overrides} />
    </I18nProvider>,
  );
  return { onClose, onDeleted, ...utils };
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('DeleteImportDialog', () => {
  it('renders nothing when there is no target', () => {
    render(
      <I18nProvider locale="fr">
        <DeleteImportDialog target={null} onClose={jest.fn()} onDeleted={jest.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is axe-clean', async () => {
    const { container } = renderDialog();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('disables the delete button until the typed text matches the filename exactly', async () => {
    const user = userEvent.setup();
    renderDialog();

    const deleteButton = screen.getByRole('button', { name: 'Delete import' });
    expect(deleteButton).toBeDisabled();

    const input = screen.getByLabelText(/Type bac_2024\.xlsx to confirm/);
    await user.type(input, 'bac_2024');
    expect(deleteButton).toBeDisabled();

    await user.type(input, '.xlsx');
    expect(deleteButton).toBeEnabled();
  });

  it('calls onClose on Cancel without ever calling the delete endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls the DELETE endpoint and onDeleted once confirmed', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ deletedAttempts: 4980 });
    const { onDeleted } = renderDialog();

    await user.type(screen.getByLabelText(/Type bac_2024\.xlsx to confirm/), 'bac_2024.xlsx');
    await user.click(screen.getByRole('button', { name: 'Delete import' }));

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/imports/42',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith(42);
    });
  });

  it('shows the server error message and does not call onDeleted on failure', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new ApiClientError('IMPORT_PROCESSING', 'still running'));
    const { onDeleted } = renderDialog();

    await user.type(screen.getByLabelText(/Type bac_2024\.xlsx to confirm/), 'bac_2024.xlsx');
    await user.click(screen.getByRole('button', { name: 'Delete import' }));

    expect(await screen.findByText('still running')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('describes the year and attempt count to be deleted', () => {
    renderDialog();
    expect(
      screen.getByText(/bac_2024\.xlsx \(year 2024\) and 4980 attempts/),
    ).toBeInTheDocument();
  });

  it('omits the year when the import has none', () => {
    renderDialog({
      target: { id: 7, originalFilename: 'bac_2025_raw.xlsx', examYear: null, attemptCount: 0 },
    });
    expect(
      screen.getByText(/bac_2025_raw\.xlsx and 0 attempts/),
    ).toBeInTheDocument();
  });
});

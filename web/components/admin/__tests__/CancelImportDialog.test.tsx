import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import { CancelImportDialog } from '../CancelImportDialog';
import type { CancelImportTarget } from '../CancelImportDialog';

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

const TARGET: CancelImportTarget = {
  id: 42,
  originalFilename: 'bac_2024.xlsx',
};

function renderDialog(overrides?: Partial<Parameters<typeof CancelImportDialog>[0]>) {
  const onClose = jest.fn();
  const onCancelled = jest.fn();
  const utils = render(
    <I18nProvider locale="fr">
      <CancelImportDialog target={TARGET} onClose={onClose} onCancelled={onCancelled} {...overrides} />
    </I18nProvider>,
  );
  return { onClose, onCancelled, ...utils };
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('CancelImportDialog', () => {
  it('renders nothing when there is no target', () => {
    render(
      <I18nProvider locale="fr">
        <CancelImportDialog target={null} onClose={jest.fn()} onCancelled={jest.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is axe-clean', async () => {
    const { container } = renderDialog();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('mentions the file being cancelled', () => {
    renderDialog();
    expect(screen.getByText(/bac_2024\.xlsx/)).toBeInTheDocument();
  });

  it('calls onClose on the dismiss button without ever calling the cancel endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Keep running' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('closes on Escape without calling the cancel endpoint', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('calls the cancel endpoint and onCancelled with the result once confirmed', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ status: 'cancelling' });
    const { onCancelled } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel import' }));

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/imports/42/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => {
      expect(onCancelled).toHaveBeenCalledWith(42, { status: 'cancelling' });
    });
  });

  it('shows the server error message and does not call onCancelled on failure', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new ApiClientError('IMPORT_NOT_CANCELLABLE', 'already finished'));
    const { onCancelled } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel import' }));

    expect(await screen.findByText('already finished')).toBeInTheDocument();
    expect(onCancelled).not.toHaveBeenCalled();
  });
});

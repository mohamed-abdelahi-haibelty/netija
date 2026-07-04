import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import MappingPage from '../page';
import type { ImportPreviewResult } from 'shared';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ lang: 'fr', importId: '42' }),
}));

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
    apiRequest: (path: string, options?: RequestInit) =>
      mockApiRequest(path, options),
    ApiClientError: MockApiClientError,
  };
});

// A realistic mix: two auto-mapped columns, one NNI column (recognized and
// ignored — the privacy case), one genuinely unrecognized column.
const PREVIEW: ImportPreviewResult = {
  columns: [
    {
      header: 'NODOSS',
      canonicalField: 'exam_no',
      status: 'mapped',
      ignoredCategory: null,
      samples: ['00123', '00456'],
    },
    {
      header: 'NOMPL',
      canonicalField: 'name_fr',
      status: 'mapped',
      ignoredCategory: null,
      samples: ['Ahmed Ould Mohamed'],
    },
    {
      header: 'NNI',
      canonicalField: null,
      status: 'ignored',
      ignoredCategory: 'nni',
      samples: ['1234567890'],
    },
    {
      header: 'REGION_ADMIN',
      canonicalField: null,
      status: 'unrecognized',
      ignoredCategory: null,
      samples: ['NORD'],
    },
  ],
  missingRequired: [],
};

function renderPage() {
  return render(
    <I18nProvider locale="fr">
      <MappingPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockImplementation((path: string) => {
    if (path.includes('/preview')) return Promise.resolve(PREVIEW);
    return Promise.resolve({});
  });
});

describe('Admin mapping page', () => {
  it('renders the detected columns, samples, and privacy labeling once loaded', async () => {
    renderPage();

    expect(await screen.findByText('NODOSS')).toBeInTheDocument();
    expect(screen.getByText('NOMPL')).toBeInTheDocument();
    expect(screen.getByText('00123')).toBeInTheDocument();
    expect(screen.getByText('REGION_ADMIN')).toBeInTheDocument();
    expect(screen.getByText('Unrecognized')).toBeInTheDocument();

    // The NNI column must read as ignored/not-stored — the privacy behavior
    // task 018 requires to be visible, not just correctly computed.
    expect(screen.getByText('Ignored — not stored')).toBeInTheDocument();
  });

  it('is axe-clean once loaded', async () => {
    const { container } = renderPage();
    await screen.findByText('NODOSS');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('blocks confirm while the floor is violated, and clears once remapped back', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('NODOSS');

    const confirmButton = screen.getByRole('button', {
      name: 'Confirm mapping',
    });
    // Floor is satisfied by the fixture, but no exam year is selected yet.
    expect(confirmButton).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const examSelect = screen.getByLabelText('Target field for NODOSS');
    await user.selectOptions(examSelect, '');

    expect(screen.getByRole('alert')).toHaveTextContent(/exam number/i);
    expect(confirmButton).toBeDisabled();

    await user.selectOptions(examSelect, 'exam_no');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('remapping an unrecognized column updates the confirm payload', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('REGION_ADMIN');

    const regionSelect = screen.getByLabelText('Target field for REGION_ADMIN');
    await user.selectOptions(regionSelect, 'serie');
    expect(regionSelect).toHaveValue('serie');

    const nniSelect = screen.getByLabelText('Target field for NNI');
    expect(nniSelect).toHaveValue('');
  });

  it('sends the remapped payload and chosen year on confirm', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('REGION_ADMIN');

    await user.selectOptions(
      screen.getByLabelText('Target field for REGION_ADMIN'),
      'serie',
    );

    await user.click(screen.getByLabelText('Exam year'));
    const yearOption = await screen.findByRole('option', {
      name: String(new Date().getFullYear()),
    });
    await user.click(yearOption);

    const confirmButton = screen.getByRole('button', {
      name: 'Confirm mapping',
    });
    await waitFor(() => {
      expect(confirmButton).toBeEnabled();
    });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/42/confirm',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const confirmCall = mockApiRequest.mock.calls.find((call) =>
      call[0].includes('/confirm'),
    );
    if (!confirmCall) throw new Error('confirm request was not sent');
    const body = JSON.parse((confirmCall[1] as { body: string }).body) as {
      mapping: Record<string, string>;
      examYear: number;
    };
    expect(body.mapping).toEqual({
      NODOSS: 'exam_no',
      NOMPL: 'name_fr',
      REGION_ADMIN: 'serie',
    });
    expect(body.examYear).toBe(new Date().getFullYear());
  });

  it('shows a clear message, not a generic error, for an unsupported file type', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path.includes('/preview')) {
        return Promise.reject(
          new ApiClientError('UNSUPPORTED_FILE_TYPE', 'internal detail never shown'),
        );
      }
      return Promise.resolve({});
    });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file could not be read',
    );
  });
});

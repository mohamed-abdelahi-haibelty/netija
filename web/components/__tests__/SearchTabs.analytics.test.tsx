import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import { SearchTabs } from '../SearchTabs';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();
jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

const mockRecordSearchAttempt = jest.fn<unknown, []>();
const mockTrackResultSearched =
  jest.fn<unknown, [string, { found: boolean; year?: number; examType?: string }]>();
jest.mock('@/lib/analytics', () => ({
  recordSearchAttempt: () => mockRecordSearchAttempt(),
  trackResultSearched: (method: string, opts: { found: boolean; year?: number; examType?: string }) =>
    mockTrackResultSearched(method, opts),
}));

function renderTabs() {
  return render(
    <I18nProvider locale="fr">
      <SearchTabs lang="fr" examType="bac" years={[2024, 2023]} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SearchTabs exam search analytics wiring', () => {
  it('records a search attempt on submit and tracks result_searched({found: true, year}) once a result is found', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ slug: 'abc123' });
    renderTabs();

    await user.type(screen.getByRole('textbox', { name: "Numéro d'examen" }), '00573');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(mockRecordSearchAttempt).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockTrackResultSearched).toHaveBeenCalledWith('exam_no', {
        found: true,
        year: 2024,
        examType: 'bac',
      });
    });
  });

  it('tracks result_searched({found: false, year}) when the exam number/year has no result', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new ApiClientError('STUDENT_NOT_FOUND', 'not found'));
    renderTabs();

    await user.type(screen.getByRole('textbox', { name: "Numéro d'examen" }), '00573');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(mockRecordSearchAttempt).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockTrackResultSearched).toHaveBeenCalledWith('exam_no', {
        found: false,
        year: 2024,
        examType: 'bac',
      });
    });
  });
});

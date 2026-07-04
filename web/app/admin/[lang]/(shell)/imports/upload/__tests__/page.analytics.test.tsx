import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/components/I18nProvider';
import UploadPage from '../page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ lang: 'fr' }),
}));

const mockTrackAdminUploadStarted = jest.fn<unknown, []>();
jest.mock('@/lib/analytics', () => ({
  trackAdminUploadStarted: () => mockTrackAdminUploadStarted(),
}));

function renderPage() {
  return render(
    <I18nProvider locale="fr">
      <UploadPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockTrackAdminUploadStarted.mockClear();
});

describe('Admin upload page analytics wiring', () => {
  it('tracks admin_upload_started once the API accepts the file', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { importId: 7 } }),
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    const file = new File(['x'], 'bac_2025.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: 'Upload file' }));

    expect(mockTrackAdminUploadStarted).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/admin/fr/imports/7/mapping');
  });

  it('never tracks admin_upload_started when the upload fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'bad file' } }),
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    const file = new File(['x'], 'bac_2025.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: 'Upload file' }));

    await screen.findByText('bad file');
    expect(mockTrackAdminUploadStarted).not.toHaveBeenCalled();
  });
});

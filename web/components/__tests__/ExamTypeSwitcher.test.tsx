import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/components/I18nProvider';
import { ExamTypeSwitcher } from '@/components/ExamTypeSwitcher';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

function renderSwitcher(examType: 'bac' | 'brevet') {
  return render(
    <I18nProvider locale="fr">
      <ExamTypeSwitcher lang="fr" examType={examType} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
});

describe('ExamTypeSwitcher', () => {
  it('marks the active exam type as pressed', () => {
    renderSwitcher('bac');
    expect(screen.getByRole('button', { name: 'Bac' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Brevet (BEPC)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('navigates to ?type= when the other type is chosen (URL is the source of truth)', async () => {
    const user = userEvent.setup();
    renderSwitcher('bac');

    await user.click(screen.getByRole('button', { name: 'Brevet (BEPC)' }));

    expect(mockReplace).toHaveBeenCalledWith('/fr?type=brevet', { scroll: false });
  });

  it('does not navigate when the already-active type is clicked', async () => {
    const user = userEvent.setup();
    renderSwitcher('brevet');

    await user.click(screen.getByRole('button', { name: 'Brevet (BEPC)' }));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});

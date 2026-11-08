import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { ExamTypeSwitcher } from '@/components/ExamTypeSwitcher';

function renderSwitcher(examType: 'bac' | 'brevet', onSelect: (type: 'bac' | 'brevet') => void) {
  return render(
    <I18nProvider locale="fr">
      <ExamTypeSwitcher examType={examType} onSelect={onSelect} />
    </I18nProvider>,
  );
}

describe('ExamTypeSwitcher', () => {
  it('marks the active exam type as pressed', () => {
    renderSwitcher('bac', jest.fn());
    expect(screen.getByRole('button', { name: 'Bac' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Brevet (BEPC)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onSelect with the newly-chosen type', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    renderSwitcher('bac', onSelect);

    await user.click(screen.getByRole('button', { name: 'Brevet (BEPC)' }));

    expect(onSelect).toHaveBeenCalledWith('brevet');
  });

  it('does not call onSelect when the already-active type is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    renderSwitcher('brevet', onSelect);

    await user.click(screen.getByRole('button', { name: 'Brevet (BEPC)' }));

    expect(onSelect).not.toHaveBeenCalled();
  });
});

import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { StudentResultCard } from '@/components/StudentResultCard';
import type { StudentResult } from 'shared';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const BAC: StudentResult = {
  slug: 'a'.repeat(32),
  examType: 'bac',
  examYear: 2024,
  examNo: '00042',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: 'أحمد ولد محمد',
  serie: 'SN',
  moyenne: '14.50',
  decision: 'Admis',
  decisionRaw: 'Admis',
};

const BREVET: StudentResult = {
  slug: 'b'.repeat(32),
  examType: 'brevet',
  examYear: 2024,
  examNo: '00099',
  nameFr: 'Fatimetou Mint Ahmed',
  nameAr: null,
  serie: null,
  moyenne: '12.00',
  decision: 'Ajourné',
  decisionRaw: 'Ajourné',
};

describe('A11y — student result page (Bac, French)', () => {
  it('is axe-clean', async () => {
    const { container } = render(
      <I18nProvider locale="fr">
        <StudentResultCard student={BAC} lang="fr" />
      </I18nProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('A11y — student result page (Bac, Arabic)', () => {
  it('is axe-clean', async () => {
    const { container } = render(
      <I18nProvider locale="ar">
        <StudentResultCard student={BAC} lang="ar" />
      </I18nProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('A11y — student result page (Brevet, French)', () => {
  it('is axe-clean with no serie row', async () => {
    const { container } = render(
      <I18nProvider locale="fr">
        <StudentResultCard student={BREVET} lang="fr" />
      </I18nProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

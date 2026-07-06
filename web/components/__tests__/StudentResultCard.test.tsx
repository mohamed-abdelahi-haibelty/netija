import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/components/I18nProvider';
import { StudentResultCard } from '@/components/StudentResultCard';
import type { StudentResult } from 'shared';

const BAC: StudentResult = {
  slug: 'a'.repeat(32),
  examType: 'bac',
  examYear: 2024,
  examNo: '00042',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: null,
  serie: 'SN',
  moyenne: '14.50',
  decision: 'Admis',
  decisionRaw: 'Admis',
};

function renderCard(student: StudentResult) {
  return render(
    <I18nProvider locale="fr">
      <StudentResultCard student={student} lang="fr" />
    </I18nProvider>,
  );
}

describe('StudentResultCard — serie by exam type', () => {
  it('shows the serie row for a Bac result', () => {
    renderCard(BAC);
    expect(screen.getByText('Série')).toBeInTheDocument();
    expect(screen.getByText('SN')).toBeInTheDocument();
  });

  it('omits the serie row entirely for a Brevet result (no track, not a blank field)', () => {
    // Brevet rows carry a null serie; the row must not render at all.
    renderCard({ ...BAC, examType: 'brevet', serie: null });
    expect(screen.queryByText('Série')).not.toBeInTheDocument();
  });
});

describe('StudentResultCard — exam type row', () => {
  it('shows "Bac" for a Bac result', () => {
    renderCard(BAC);
    expect(screen.getByText('Examen')).toBeInTheDocument();
    expect(screen.getByText('Bac')).toBeInTheDocument();
  });

  it('shows "Brevet (BEPC)" for a Brevet result', () => {
    renderCard({ ...BAC, examType: 'brevet', serie: null });
    expect(screen.getByText('Brevet (BEPC)')).toBeInTheDocument();
  });
});

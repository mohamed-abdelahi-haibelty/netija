import { render, screen, waitFor } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { StudentResultCard } from '@/components/StudentResultCard';
import type { StudentResult } from 'shared';

jest.mock('canvas-confetti', () => ({
  __esModule: true,
  default: jest.fn(),
}));

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

describe('StudentResultCard — motivational note', () => {
  it('shows a congratulatory note for an Admis result', () => {
    renderCard(BAC);
    expect(
      screen.getByText("Mille félicitations ! Aujourd'hui, tu récoltes le fruit de tes efforts."),
    ).toBeInTheDocument();
  });

  it('shows an encouraging note for an Ajourné result, never the raw decision as the note', () => {
    renderCard({ ...BAC, decision: 'Ajourné' });
    expect(
      screen.getByText('Bonne chance pour la prochaine fois.'),
    ).toBeInTheDocument();
  });

  it('shows an encouraging note for a Sessionnaire result', () => {
    renderCard({ ...BAC, decision: 'Sessionnaire' });
    expect(
      screen.getByText('Bon courage pour la session de rattrapage.'),
    ).toBeInTheDocument();
  });

  it('shows no motivational note for a decision outside pass/fail/pending (e.g. Absent)', () => {
    renderCard({ ...BAC, decision: 'Absent', moyenne: null });
    expect(
      screen.queryByText("Mille félicitations ! Aujourd'hui, tu récoltes le fruit de tes efforts."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Bonne chance pour la prochaine fois.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Bon courage pour la session de rattrapage.'),
    ).not.toBeInTheDocument();
  });
});

describe('StudentResultCard — Admis confetti celebration', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.clearAllMocks();
  });

  function mockMotionAllowed() {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }

  it('fires a confetti burst for an Admis result when motion is allowed', async () => {
    mockMotionAllowed();
    renderCard(BAC);
    await waitFor(() => {
      expect(confetti).toHaveBeenCalledTimes(1);
    });
  });

  it('never fires confetti for a failing result, even when motion is allowed', async () => {
    mockMotionAllowed();
    renderCard({ ...BAC, decision: 'Ajourné' });
    // Nothing to await on a negative assertion; flush the microtask queue
    // the dynamic import would have resolved on, then assert it never ran.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(confetti).not.toHaveBeenCalled();
  });

  it('never fires confetti when prefers-reduced-motion is set (jest.setup default)', async () => {
    // jest.setup.ts globally mocks matchMedia to reduced-motion; no override here.
    renderCard(BAC);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(confetti).not.toHaveBeenCalled();
  });
});

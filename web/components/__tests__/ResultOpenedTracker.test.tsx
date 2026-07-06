import { render } from '@testing-library/react';
import { ResultOpenedTracker } from '../ResultOpenedTracker';

const mockConsumeSearchAttempts = jest.fn<number, []>();
const mockTrackResultOpened = jest.fn<unknown, [number, string, string?]>();
jest.mock('@/lib/analytics', () => ({
  consumeSearchAttempts: () => mockConsumeSearchAttempts(),
  trackResultOpened: (n: number, examType: string, serie?: string) =>
    mockTrackResultOpened(n, examType, serie),
}));

beforeEach(() => {
  mockConsumeSearchAttempts.mockClear();
  mockTrackResultOpened.mockClear();
});

describe('ResultOpenedTracker', () => {
  it('tracks result_opened once on mount with the consumed count and exam type', () => {
    mockConsumeSearchAttempts.mockReturnValue(3);

    render(<ResultOpenedTracker examType="bac" />);

    expect(mockConsumeSearchAttempts).toHaveBeenCalledTimes(1);
    expect(mockTrackResultOpened).toHaveBeenCalledWith(3, 'bac', undefined);
  });

  it('passes serie through as a safe categorical when the result page has one (Bac)', () => {
    mockConsumeSearchAttempts.mockReturnValue(2);

    render(<ResultOpenedTracker examType="bac" serie="SN" />);

    expect(mockTrackResultOpened).toHaveBeenCalledWith(2, 'bac', 'SN');
  });

  it('tracks a Brevet result with no serie', () => {
    mockConsumeSearchAttempts.mockReturnValue(1);

    render(<ResultOpenedTracker examType="brevet" />);

    expect(mockTrackResultOpened).toHaveBeenCalledWith(1, 'brevet', undefined);
  });

  it('renders nothing', () => {
    mockConsumeSearchAttempts.mockReturnValue(1);
    const { container } = render(<ResultOpenedTracker examType="bac" />);
    expect(container).toBeEmptyDOMElement();
  });
});

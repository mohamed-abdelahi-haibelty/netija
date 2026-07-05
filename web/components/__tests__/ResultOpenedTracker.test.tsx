import { render } from '@testing-library/react';
import { ResultOpenedTracker } from '../ResultOpenedTracker';

const mockConsumeSearchAttempts = jest.fn<number, []>();
const mockTrackResultOpened = jest.fn<unknown, [number, string?]>();
jest.mock('@/lib/analytics', () => ({
  consumeSearchAttempts: () => mockConsumeSearchAttempts(),
  trackResultOpened: (n: number, serie?: string) => mockTrackResultOpened(n, serie),
}));

beforeEach(() => {
  mockConsumeSearchAttempts.mockClear();
  mockTrackResultOpened.mockClear();
});

describe('ResultOpenedTracker', () => {
  it('tracks result_opened once on mount with the consumed search-attempt count', () => {
    mockConsumeSearchAttempts.mockReturnValue(3);

    render(<ResultOpenedTracker />);

    expect(mockConsumeSearchAttempts).toHaveBeenCalledTimes(1);
    expect(mockTrackResultOpened).toHaveBeenCalledWith(3, undefined);
  });

  it('passes serie through as a safe categorical when the result page has one', () => {
    mockConsumeSearchAttempts.mockReturnValue(2);

    render(<ResultOpenedTracker serie="SN" />);

    expect(mockTrackResultOpened).toHaveBeenCalledWith(2, 'SN');
  });

  it('renders nothing', () => {
    mockConsumeSearchAttempts.mockReturnValue(1);
    const { container } = render(<ResultOpenedTracker />);
    expect(container).toBeEmptyDOMElement();
  });
});

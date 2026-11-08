import { render } from '@testing-library/react';
import { AnalyticsInit } from '../AnalyticsInit';

const mockInitAnalytics = jest.fn<unknown, []>();
jest.mock('@/lib/analytics', () => ({
  initAnalytics: () => mockInitAnalytics(),
}));

beforeEach(() => {
  mockInitAnalytics.mockClear();
});

describe('AnalyticsInit', () => {
  it('calls initAnalytics once on mount, off the initial render path', () => {
    render(<AnalyticsInit />);
    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
  });

  it('renders nothing', () => {
    const { container } = render(<AnalyticsInit />);
    expect(container).toBeEmptyDOMElement();
  });
});

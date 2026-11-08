import { render } from '@testing-library/react';
import { PostHogPageview } from '../PostHogPageview';

const mockUsePathname = jest.fn<string, []>();
const mockUseSearchParams = jest.fn<URLSearchParams, []>();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

const mockCapturePageview = jest.fn<unknown, [string, string]>();
jest.mock('@/lib/analytics', () => ({
  capturePageview: (pathname: string, search: string) => mockCapturePageview(pathname, search),
}));

beforeEach(() => {
  mockCapturePageview.mockClear();
  mockUsePathname.mockReturnValue('/fr/results/abc');
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe('PostHogPageview', () => {
  it('captures a pageview on mount with the current path and query string', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('utm_source=tiktok'));

    render(<PostHogPageview />);

    expect(mockCapturePageview).toHaveBeenCalledWith('/fr/results/abc', 'utm_source=tiktok');
  });

  it('captures a new pageview when the pathname changes', () => {
    const { rerender } = render(<PostHogPageview />);
    expect(mockCapturePageview).toHaveBeenCalledTimes(1);

    mockUsePathname.mockReturnValue('/fr/results/other');
    rerender(<PostHogPageview />);

    expect(mockCapturePageview).toHaveBeenCalledTimes(2);
    expect(mockCapturePageview).toHaveBeenLastCalledWith('/fr/results/other', '');
  });

  it('renders nothing', () => {
    const { container } = render(<PostHogPageview />);
    expect(container).toBeEmptyDOMElement();
  });
});

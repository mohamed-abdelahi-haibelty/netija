import '@testing-library/jest-dom';

// Next.js Link uses IntersectionObserver for prefetching. jsdom doesn't
// implement it, which causes act() warnings after tests complete. A no-op
// stub silences the warning without affecting test behavior.
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;

// jsdom has no matchMedia; components that respect prefers-reduced-motion
// (e.g. StudentResultCard's count-up) call it on mount. Default to
// reduced-motion so animated values settle instantly in tests.
window.matchMedia = (query: string): MediaQueryList => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

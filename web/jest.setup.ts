import '@testing-library/jest-dom';

// Next.js Link uses IntersectionObserver for prefetching. jsdom doesn't
// implement it, which causes act() warnings after tests complete. A no-op
// stub silences the warning without affecting test behavior.
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;

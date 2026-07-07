import { useEffect, useState } from 'react';

// Ticks a rate-limit countdown down to zero, one second at a time, then
// clears itself. Shared by SearchTabs and NameAutocomplete.
export function useRateLimitCountdown(): [number | null, (seconds: number | null) => void] {
  const [rateLimitedFor, setRateLimitedFor] = useState<number | null>(null);

  useEffect(() => {
    if (rateLimitedFor === null) return;
    if (rateLimitedFor <= 0) {
      setRateLimitedFor(null);
      return;
    }
    const timer = setTimeout(() => {
      setRateLimitedFor((seconds) => (seconds === null ? null : seconds - 1));
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [rateLimitedFor]);

  return [rateLimitedFor, setRateLimitedFor];
}

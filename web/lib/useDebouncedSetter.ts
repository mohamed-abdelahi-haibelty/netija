import { useEffect, useRef } from 'react';

/**
 * Returns a `debounce(run)` function that delays `run` by `delayMs`,
 * cancelling any pending call still waiting (including on unmount).
 * Shared by every admin page filter that fires a fetch after the visitor
 * stops typing (cache's pattern filter, search-index's mutually-exclusive
 * importId/q filters, rows' search filter). Call this hook once per page —
 * a page with more than one debounced filter shares a single timer, so
 * typing into one filter cancels another's still-pending debounce instead
 * of both firing.
 */
export function useDebouncedSetter(delayMs: number): (run: () => void) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (run: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(run, delayMs);
  };
}

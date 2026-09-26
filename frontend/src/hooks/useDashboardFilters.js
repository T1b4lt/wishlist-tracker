import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'wouter';
import {
  DEFAULT_FILTERS,
  parseFilters,
  serializeFilters
} from '@/lib/productFilters';

/**
 * The dashboard's search/filter/sort state, stored in the URL's query
 * params so it survives opening a product and coming back (or a reload),
 * and can be bookmarked. Updates replace the current history entry rather
 * than pushing one, so typing in the search box does not flood the back
 * button with one entry per keystroke.
 *
 * @returns {{
 *   filters: import('@/lib/productFilters').ProductFilters,
 *   setFilters: (patch: Partial<import('@/lib/productFilters').ProductFilters>) => void,
 *   resetFilters: () => void
 * }}
 */
export function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  // The functional form reads wouter's pending params, so several updates
  // in the same tick build on each other instead of the last one winning.
  const setFilters = useCallback(
    (patch) =>
      setSearchParams(
        (current) => serializeFilters({ ...parseFilters(current), ...patch }),
        { replace: true }
      ),
    [setSearchParams]
  );

  const resetFilters = useCallback(
    () =>
      setSearchParams(
        (current) =>
          serializeFilters({
            ...DEFAULT_FILTERS,
            sort: parseFilters(current).sort
          }),
        { replace: true }
      ),
    [setSearchParams]
  );

  return { filters, setFilters, resetFilters };
}

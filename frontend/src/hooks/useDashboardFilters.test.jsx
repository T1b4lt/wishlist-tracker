import { act, renderHook } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { DEFAULT_FILTERS } from '@/lib/productFilters';
import { useDashboardFilters } from './useDashboardFilters';

const renderWithLocation = (path = '/') => {
  const location = memoryLocation({ path, record: true });
  const wrapper = ({ children }) => (
    <Router hook={location.hook} searchHook={location.searchHook}>
      {children}
    </Router>
  );
  return { location, ...renderHook(() => useDashboardFilters(), { wrapper }) };
};

describe('useDashboardFilters', () => {
  it('returns the defaults for a URL without query params', () => {
    const { result } = renderWithLocation('/');
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it('reads the filters from the URL', () => {
    const { result } = renderWithLocation('/?q=dji&store=3&sort=price_asc');
    expect(result.current.filters).toEqual({
      ...DEFAULT_FILTERS,
      query: 'dji',
      stores: [3],
      sort: 'price_asc'
    });
  });

  it('merges a partial update into the URL, replacing the history entry', () => {
    const { result, location } = renderWithLocation('/?q=dji');

    act(() => result.current.setFilters({ stock: 'in' }));

    expect(result.current.filters).toMatchObject({ query: 'dji', stock: 'in' });
    expect(location.history).toEqual(['/?q=dji&stock=in']);
  });

  it('keeps consecutive updates in the same tick', () => {
    const { result } = renderWithLocation('/');

    act(() => {
      result.current.setFilters({ query: 'dji' });
      result.current.setFilters({ priceDrop: true });
    });

    expect(result.current.filters).toMatchObject({
      query: 'dji',
      priceDrop: true
    });
  });

  it('clears every filter but keeps the sort order on reset', () => {
    const { result, location } = renderWithLocation(
      '/?q=dji&stock=in&sort=price_desc'
    );

    act(() => result.current.resetFilters());

    expect(result.current.filters).toEqual({
      ...DEFAULT_FILTERS,
      sort: 'price_desc'
    });
    expect(location.history.at(-1)).toBe('/?sort=price_desc');
  });

  it('can keep the search query when clearing the filters', () => {
    const { result } = renderWithLocation('/?q=dji&stock=in&sort=price_desc');

    act(() => result.current.resetFilters({ keepQuery: true }));

    expect(result.current.filters).toEqual({
      ...DEFAULT_FILTERS,
      query: 'dji',
      sort: 'price_desc'
    });
  });
});

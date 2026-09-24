import { describe, expect, it } from 'vitest';
import { computeDashboardSummary } from './dashboardSummary';

const product = (overrides = {}) => ({
  current_price: 100,
  currency: 'EUR',
  price_change_60d: 0,
  recent_prices: [100],
  ...overrides
});

describe('computeDashboardSummary', () => {
  it('returns zero/hidden stats for an empty product list', () => {
    expect(computeDashboardSummary([])).toEqual({
      itemCount: 0,
      totalsByCurrency: [],
      priceDropCount: null,
      atLowestCount: null
    });
  });

  it('counts every product as the item count', () => {
    const summary = computeDashboardSummary([product(), product(), product()]);
    expect(summary.itemCount).toBe(3);
  });

  it('groups the total current value by currency', () => {
    const summary = computeDashboardSummary([
      product({ current_price: 10, currency: 'EUR' }),
      product({ current_price: 20, currency: 'EUR' }),
      product({ current_price: 5, currency: 'USD' })
    ]);
    expect(summary.totalsByCurrency).toEqual([
      { currency: 'EUR', total: 30 },
      { currency: 'USD', total: 5 }
    ]);
  });

  it('sorts currency totals alphabetically for a stable order', () => {
    const summary = computeDashboardSummary([
      product({ current_price: 5, currency: 'USD' }),
      product({ current_price: 10, currency: 'EUR' })
    ]);
    expect(summary.totalsByCurrency.map((t) => t.currency)).toEqual([
      'EUR',
      'USD'
    ]);
  });

  it('excludes products with a missing price or currency from the total', () => {
    const summary = computeDashboardSummary([
      product({ current_price: null, currency: 'EUR' }),
      product({ current_price: 10, currency: null }),
      product({ current_price: 10, currency: 'EUR' })
    ]);
    expect(summary.totalsByCurrency).toEqual([{ currency: 'EUR', total: 10 }]);
  });

  it('hides the total value stat when no product has a computable price', () => {
    const summary = computeDashboardSummary([
      product({ current_price: null }),
      product({ current_price: undefined, currency: null })
    ]);
    expect(summary.totalsByCurrency).toEqual([]);
  });

  it('counts only products whose 60-day price change is negative as price drops', () => {
    const summary = computeDashboardSummary([
      product({ price_change_60d: -5 }),
      product({ price_change_60d: -0.1 }),
      product({ price_change_60d: 0 }),
      product({ price_change_60d: 3 })
    ]);
    expect(summary.priceDropCount).toBe(2);
  });

  it('hides the price-drops stat when no product has a computable price change', () => {
    const summary = computeDashboardSummary([
      product({ price_change_60d: null }),
      product({ price_change_60d: undefined })
    ]);
    expect(summary.priceDropCount).toBeNull();
  });

  it('counts a product as "at lowest" when its current price equals the minimum of its recent prices', () => {
    const summary = computeDashboardSummary([
      product({ current_price: 8, recent_prices: [10, 9, 8] }),
      product({ current_price: 10, recent_prices: [10, 9, 8] }),
      product({ current_price: 5, recent_prices: [5] })
    ]);
    expect(summary.atLowestCount).toBe(2);
  });

  it('does not count a product as "at lowest" when its own recent_prices is missing or empty', () => {
    const summary = computeDashboardSummary([
      // Not "at lowest": no recent_prices to compare against, but counted
      // (not hidden) because another product below does have usable ones.
      product({ current_price: 8, recent_prices: [] }),
      product({ current_price: 8, recent_prices: null }),
      product({ current_price: 12, recent_prices: [10, 11] })
    ]);
    expect(summary.atLowestCount).toBe(0);
  });

  it('hides the at-lowest stat when no product has any usable recent_prices', () => {
    const summary = computeDashboardSummary([
      product({ recent_prices: [] }),
      product({ recent_prices: null })
    ]);
    expect(summary.atLowestCount).toBeNull();
  });

  it('ignores non-finite numbers within recent_prices when computing the minimum', () => {
    const summary = computeDashboardSummary([
      product({ current_price: 8, recent_prices: [null, 8, undefined, NaN] })
    ]);
    expect(summary.atLowestCount).toBe(1);
  });
});

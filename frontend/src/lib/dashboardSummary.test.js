import { describe, expect, it } from 'vitest';
import { computeDashboardSummary } from './dashboardSummary';

const product = (overrides = {}) => ({
  current_price: 100,
  currency: 'EUR',
  price_change_pct: 0,
  is_at_lowest: false,
  recent_prices: [100],
  ...overrides
});

describe('computeDashboardSummary', () => {
  it('returns zero/hidden stats for an empty product list', () => {
    expect(computeDashboardSummary([])).toEqual({
      itemCount: 0,
      totalsByCurrency: [],
      priceDropCount: null,
      atLowestCount: null,
      staleCount: 0
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

  it('counts only products whose price change is negative as price drops', () => {
    const summary = computeDashboardSummary([
      product({ price_change_pct: -5 }),
      product({ price_change_pct: -0.1 }),
      product({ price_change_pct: 0 }),
      product({ price_change_pct: 3 })
    ]);
    expect(summary.priceDropCount).toBe(2);
  });

  it('hides the price-drops stat when no product has a computable price change', () => {
    const summary = computeDashboardSummary([
      product({ price_change_pct: null }),
      product({ price_change_pct: undefined })
    ]);
    expect(summary.priceDropCount).toBeNull();
  });

  it('counts the products the backend flags as at their lowest price', () => {
    const summary = computeDashboardSummary([
      product({ is_at_lowest: true }),
      product({ is_at_lowest: false }),
      product({ is_at_lowest: true })
    ]);
    expect(summary.atLowestCount).toBe(2);
  });

  it('hides the at-lowest stat when no product has any history', () => {
    const summary = computeDashboardSummary([
      product({ current_price: null, is_at_lowest: false }),
      product({ current_price: undefined, is_at_lowest: false })
    ]);
    expect(summary.atLowestCount).toBeNull();
  });

  it('counts the products whose price has not been updated for a while', () => {
    const now = 10 * 86400;
    const summary = computeDashboardSummary(
      [
        product({ last_checked_at: now - 5 * 86400 }),
        product({ last_checked_at: now - 3 * 86400 }),
        product({ last_checked_at: now - 86400 }),
        product({ last_checked_at: null })
      ],
      now
    );
    expect(summary.staleCount).toBe(2);
  });
});

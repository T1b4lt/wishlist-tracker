import { describe, expect, it } from 'vitest';
import { singleStoreDetail, singleStoreProduct } from './products';

const DAY = 60 * 60 * 24;

describe('test product helpers', () => {
  it('flags a product checked 5 days ago as stale, like the backend', () => {
    const now = Math.floor(Date.now() / 1000);

    const product = singleStoreProduct({
      id: 1,
      last_checked_at: now - 5 * DAY - 60
    });

    expect(product.offers[0]).toMatchObject({
      is_stale: true,
      days_since_check: 5
    });
    expect(product).toMatchObject({ is_stale: true, stale_days: 5 });
  });

  it('precomputes every range of a detail, like the backend', () => {
    const now = Math.floor(Date.now() / 1000);

    const detail = singleStoreDetail({
      id: 1,
      price_history: [
        { timestamp: now - 10 * DAY, price: 100, is_in_stock: true },
        { timestamp: now - DAY, price: 80, is_in_stock: true }
      ]
    });

    expect(detail.ranges.map((range) => range.key)).toEqual([
      '30',
      '60',
      '90',
      '180',
      'all'
    ]);
    expect(detail.best_offer_id).toBe(10);
    expect(detail.default_range).toBe('60');
    expect(detail.ranges[0]).toMatchObject({
      average: 100,
      price_change_pct: -20,
      lowest: { price: 80, offer_id: 10 }
    });
  });
});

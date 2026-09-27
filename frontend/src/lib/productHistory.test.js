import { describe, expect, it } from 'vitest';
import {
  filterPriceHistoryByWindow,
  buildChartPoints,
  computeYDomain,
  hasEnoughHistory,
  getTrackingStartTimestamp
} from './productHistory';

describe('filterPriceHistoryByWindow', () => {
  const history = [
    { timestamp: 300, price: 3, is_in_stock: true },
    { timestamp: 100, price: 1, is_in_stock: true },
    { timestamp: 200, price: 2, is_in_stock: true }
  ];

  it('sorts ascending and keeps everything without a window start', () => {
    expect(
      filterPriceHistoryByWindow(history, null).map((r) => r.timestamp)
    ).toEqual([100, 200, 300]);
  });

  it('keeps the records at or after the window start', () => {
    expect(
      filterPriceHistoryByWindow(history, 200).map((r) => r.timestamp)
    ).toEqual([200, 300]);
  });

  it('handles a missing history', () => {
    expect(filterPriceHistoryByWindow(undefined, 100)).toEqual([]);
  });
});

describe('buildChartPoints', () => {
  it('returns an empty array for missing input', () => {
    expect(buildChartPoints(null)).toEqual([]);
  });

  it('sets changePercent to null for the first point', () => {
    const points = buildChartPoints([
      { timestamp: 1, price: 100, is_in_stock: true }
    ]);
    expect(points[0].changePercent).toBeNull();
  });

  it('computes the percentage change versus the previous point', () => {
    const points = buildChartPoints([
      { timestamp: 1, price: 100, is_in_stock: true },
      { timestamp: 2, price: 110, is_in_stock: true },
      { timestamp: 3, price: 99, is_in_stock: false }
    ]);
    expect(points[1].changePercent).toBeCloseTo(10);
    expect(points[2].changePercent).toBeCloseTo(-10);
    expect(points[2].isInStock).toBe(false);
  });

  it('does not divide by zero when the previous price is 0', () => {
    const points = buildChartPoints([
      { timestamp: 1, price: 0, is_in_stock: true },
      { timestamp: 2, price: 5, is_in_stock: true }
    ]);
    expect(points[1].changePercent).toBeNull();
  });
});

describe('computeYDomain', () => {
  it('returns ["auto", "auto"] for an empty range', () => {
    expect(computeYDomain([])).toEqual(['auto', 'auto']);
  });

  it('pads around the min and max', () => {
    const history = [
      { timestamp: 1, price: 100, is_in_stock: true },
      { timestamp: 2, price: 200, is_in_stock: true }
    ];
    const [min, max] = computeYDomain(history, 0.1);
    expect(min).toBeCloseTo(90);
    expect(max).toBeCloseTo(210);
  });

  it('still pads a flat (single-price) range', () => {
    const history = [
      { timestamp: 1, price: 50, is_in_stock: true },
      { timestamp: 2, price: 50, is_in_stock: true }
    ];
    const [min, max] = computeYDomain(history, 0.1);
    expect(min).toBeLessThan(50);
    expect(max).toBeGreaterThan(50);
  });

  it('pads a flat range of 0 upward only (never below zero)', () => {
    const history = [{ timestamp: 1, price: 0, is_in_stock: true }];
    const [min, max] = computeYDomain(history);
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(0);
  });

  it('never extends the domain below zero', () => {
    const history = [
      { timestamp: 1, price: 5, is_in_stock: true },
      { timestamp: 2, price: 100, is_in_stock: true }
    ];
    const [min] = computeYDomain(history, 0.1);
    expect(min).toBe(0);
  });
});

describe('hasEnoughHistory', () => {
  it('is false for fewer than 2 records', () => {
    expect(hasEnoughHistory([])).toBe(false);
    expect(
      hasEnoughHistory([{ timestamp: 1, price: 1, is_in_stock: true }])
    ).toBe(false);
    expect(hasEnoughHistory(null)).toBe(false);
  });

  it('is true for 2 or more records', () => {
    expect(
      hasEnoughHistory([
        { timestamp: 1, price: 1, is_in_stock: true },
        { timestamp: 2, price: 1, is_in_stock: true }
      ])
    ).toBe(true);
  });
});

describe('getTrackingStartTimestamp', () => {
  it('returns null for missing/empty history', () => {
    expect(getTrackingStartTimestamp(null)).toBeNull();
    expect(getTrackingStartTimestamp([])).toBeNull();
  });

  it('returns the earliest timestamp regardless of input order', () => {
    const history = [
      { timestamp: 300, price: 1, is_in_stock: true },
      { timestamp: 100, price: 1, is_in_stock: true },
      { timestamp: 200, price: 1, is_in_stock: true }
    ];
    expect(getTrackingStartTimestamp(history)).toBe(100);
  });
});

import { describe, expect, it } from 'vitest';
import {
  RANGE_ALL,
  RANGE_OPTIONS,
  resolveDefaultRange,
  filterPriceHistoryByRange,
  buildChartPoints,
  computeRangeStats,
  computeYDomain,
  computeOutOfStockBands,
  hasEnoughHistory,
  getTrackingStartTimestamp,
  getCurrentRecord
} from './productHistory';

const DAY = 60 * 60 * 24;
const NOW = 1_700_000_000;

describe('resolveDefaultRange', () => {
  it('returns the configured window when it is one of the options', () => {
    for (const option of RANGE_OPTIONS) {
      expect(resolveDefaultRange(Number(option))).toBe(option);
    }
  });

  it('falls back to the default window for any other value', () => {
    for (const value of [45, 1, 1000, null, undefined, NaN]) {
      expect(resolveDefaultRange(value)).toBe('60');
    }
  });
});

describe('filterPriceHistoryByRange', () => {
  const history = [
    { timestamp: NOW - 100 * DAY, price: 10, is_in_stock: true },
    { timestamp: NOW - 50 * DAY, price: 20, is_in_stock: true },
    { timestamp: NOW - 10 * DAY, price: 30, is_in_stock: true }
  ];

  it('returns every record, sorted, for RANGE_ALL', () => {
    const shuffled = [history[2], history[0], history[1]];
    const result = filterPriceHistoryByRange(shuffled, RANGE_ALL, NOW);
    expect(result.map((r) => r.price)).toEqual([10, 20, 30]);
  });

  it('keeps only records within the last N days', () => {
    const result = filterPriceHistoryByRange(history, '60', NOW);
    expect(result.map((r) => r.price)).toEqual([20, 30]);
  });

  it('includes a record exactly at the cutoff boundary', () => {
    const boundary = [
      { timestamp: NOW - 30 * DAY, price: 5, is_in_stock: true }
    ];
    const result = filterPriceHistoryByRange(boundary, '30', NOW);
    expect(result).toHaveLength(1);
  });

  it('excludes a record just past the cutoff boundary', () => {
    const pastCutoff = [
      { timestamp: NOW - 30 * DAY - 1, price: 5, is_in_stock: true }
    ];
    const result = filterPriceHistoryByRange(pastCutoff, '30', NOW);
    expect(result).toHaveLength(0);
  });

  it('returns an empty array for missing input', () => {
    expect(filterPriceHistoryByRange(null, RANGE_ALL, NOW)).toEqual([]);
    expect(filterPriceHistoryByRange(undefined, '30', NOW)).toEqual([]);
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

describe('getCurrentRecord', () => {
  it('returns null for missing/empty history', () => {
    expect(getCurrentRecord(null)).toBeNull();
    expect(getCurrentRecord([])).toBeNull();
  });

  it('returns the newest record regardless of input order', () => {
    const newest = { timestamp: 3, price: 30, is_in_stock: false };
    expect(
      getCurrentRecord([
        { timestamp: 2, price: 20, is_in_stock: true },
        newest,
        { timestamp: 1, price: 10, is_in_stock: true }
      ])
    ).toBe(newest);
  });
});

// The shared formulas are pinned by `productHistory.contract.test.js`; these
// cases only cover JavaScript-specific inputs.
describe('computeRangeStats', () => {
  const empty = {
    lowest: null,
    average: null,
    currentVsAverage: null,
    isAtLowest: false
  };

  it('returns empty stats for missing input', () => {
    expect(computeRangeStats(null, null)).toEqual(empty);
    expect(computeRangeStats(undefined, undefined)).toEqual(empty);
  });

  it('averages every in-stock record when there is no current record', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: true },
      { timestamp: 2, price: 20, is_in_stock: true }
    ];
    const stats = computeRangeStats(history, null);
    expect(stats.average).toBeCloseTo(15);
    expect(stats.currentVsAverage).toBeNull();
    expect(stats.isAtLowest).toBe(false);
  });

  it('ignores records with a non-finite price', () => {
    const current = { timestamp: 3, price: 10, is_in_stock: true };
    const history = [
      { timestamp: 1, price: NaN, is_in_stock: true },
      { timestamp: 2, price: 20, is_in_stock: true },
      current
    ];
    const stats = computeRangeStats(history, current);
    expect(stats.average).toBeCloseTo(20);
    expect(stats.lowest).toEqual({ price: 10, timestamp: 3 });
  });

  it('has no change for a current record with a non-finite price', () => {
    const current = { timestamp: 2, price: NaN, is_in_stock: true };
    const history = [{ timestamp: 1, price: 20, is_in_stock: true }, current];
    const stats = computeRangeStats(history, current);
    expect(stats.currentVsAverage).toBeNull();
    expect(stats.isAtLowest).toBe(false);
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

describe('computeOutOfStockBands', () => {
  it('returns an empty array when nothing is out of stock', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: true },
      { timestamp: 2, price: 10, is_in_stock: true }
    ];
    expect(computeOutOfStockBands(history)).toEqual([]);
  });

  it('closes a contiguous run at the timestamp stock came back (covering the real period), for a single out-of-stock sample between two in-stock ones', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: true },
      { timestamp: 2, price: 10, is_in_stock: false },
      { timestamp: 4, price: 10, is_in_stock: true }
    ];
    // Not {x1: 2, x2: 2} (zero-width, invisible): the band spans the whole
    // interval up to when stock actually returned.
    expect(computeOutOfStockBands(history)).toEqual([{ x1: 2, x2: 4 }]);
  });

  it('closes a multi-sample run at the timestamp stock came back, not at its last out-of-stock sample', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: true },
      { timestamp: 2, price: 10, is_in_stock: false },
      { timestamp: 3, price: 10, is_in_stock: false },
      { timestamp: 5, price: 10, is_in_stock: true }
    ];
    // Not {x1: 2, x2: 3}: the period the product was actually out of stock
    // extends to timestamp 5, when the next check found it back in stock.
    expect(computeOutOfStockBands(history)).toEqual([{ x1: 2, x2: 5 }]);
  });

  it('extends a single trailing sample backward, by half the gap to its preceding neighbour, instead of past the last point', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: true },
      { timestamp: 3, price: 10, is_in_stock: false }
    ];
    // Gap to the preceding sample is 3 - 1 = 2, so the band starts 1 before
    // timestamp 3 and ends exactly at it (never past it: past `lastTimestamp`
    // would fall outside the chart's `['dataMin', 'dataMax']` X domain and be
    // clipped), instead of collapsing to a zero-width {x1: 3, x2: 3}.
    expect(computeOutOfStockBands(history)).toEqual([{ x1: 2, x2: 3 }]);
  });

  it('ends a multi-sample trailing run at its last sample (already non-zero-width, entirely inside the domain)', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: true },
      { timestamp: 2, price: 10, is_in_stock: false },
      { timestamp: 3, price: 10, is_in_stock: false }
    ];
    expect(computeOutOfStockBands(history)).toEqual([{ x1: 2, x2: 3 }]);
  });

  it('finds a run that starts at the first record and closes when stock returns', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: false },
      { timestamp: 2, price: 10, is_in_stock: true }
    ];
    expect(computeOutOfStockBands(history)).toEqual([{ x1: 1, x2: 2 }]);
  });

  it('finds multiple separate runs, each closed at its own "back in stock" timestamp', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: false },
      { timestamp: 2, price: 10, is_in_stock: true },
      { timestamp: 3, price: 10, is_in_stock: false },
      { timestamp: 4, price: 10, is_in_stock: false },
      { timestamp: 6, price: 10, is_in_stock: true }
    ];
    expect(computeOutOfStockBands(history)).toEqual([
      { x1: 1, x2: 2 },
      { x1: 3, x2: 6 }
    ]);
  });

  it('leaves a trailing run zero-width when there is no neighbouring sample to measure a gap from', () => {
    const history = [{ timestamp: 5, price: 10, is_in_stock: false }];
    // Documented edge case: with only 1 record total there is no gap to
    // extend by. The chart itself never renders with fewer than 2 points
    // regardless (see `hasEnoughHistory`).
    expect(computeOutOfStockBands(history)).toEqual([{ x1: 5, x2: 5 }]);
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

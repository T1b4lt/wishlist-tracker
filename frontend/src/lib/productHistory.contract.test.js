import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import {
  RANGE_ALL,
  computeRangeStats,
  filterPriceHistoryByRange,
  getCurrentRecord
} from './productHistory';

// The same cases (`contracts/price-stats-cases.json`) run against the
// backend's `price_stats.py` in `test_price_stats_contract.py`, so the two
// implementations cannot drift apart silently.

const { tolerance, cases } = readContract('price-stats-cases.json');

const expectClose = (actual, expected) => {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

describe('price-stats contract', () => {
  it.each(cases.map((testCase) => [testCase.name, testCase]))(
    '%s',
    (_name, { history, now, window_days: windowDays, expected }) => {
      const range = windowDays === null ? RANGE_ALL : String(windowDays);
      const window = filterPriceHistoryByRange(history, range, now);
      const stats = computeRangeStats(window, getCurrentRecord(history));

      expect(window).toHaveLength(expected.window_prices.length);
      window.forEach((record, index) =>
        expectClose(record.price, expected.window_prices[index])
      );
      expectClose(stats.average, expected.average);
      expectClose(stats.currentVsAverage, expected.price_change_pct);
      if (expected.lowest === null) {
        expect(stats.lowest).toBeNull();
      } else {
        expectClose(stats.lowest.price, expected.lowest.price);
        expect(stats.lowest.timestamp).toBe(expected.lowest.timestamp);
      }
      expect(stats.isAtLowest).toBe(expected.is_at_lowest);
    }
  );
});

import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import { DEFAULT_HIST_WINDOW, HIST_WINDOW_OPTIONS } from './histWindow';
import { RANGE_OPTIONS } from './productHistory';
import {
  buildDashboardProduct,
  buildHistoryPoint,
  buildProductDetail
} from '../../e2e/fixtures/products';
import { buildDailyCheck } from '../../e2e/fixtures/dailyCheck';

// Frontend side of the shared contracts (see `contracts/README.md`); the
// backend side lives in `backend/tests/test_contracts.py`.

const HIST_WINDOW = readContract('hist-window.json');

describe('hist-window contract', () => {
  it('pins the window options', () => {
    expect(HIST_WINDOW_OPTIONS).toEqual(HIST_WINDOW.options);
  });

  it('pins the default window', () => {
    expect(DEFAULT_HIST_WINDOW).toBe(HIST_WINDOW.default);
  });

  it('offers exactly the window options as chart ranges', () => {
    expect(RANGE_OPTIONS.map(Number)).toEqual(HIST_WINDOW.options);
  });
});

const API_FIELDS = readContract('api-fields.json');

const sortedKeys = (object) => Object.keys(object).sort();

describe('api-fields contract', () => {
  // The e2e fixtures stand in for the backend responses in every
  // Playwright spec, so they must have exactly the backend schema fields.
  it('matches the dashboard summary fields', () => {
    expect(sortedKeys(buildDashboardProduct())).toEqual(
      [...API_FIELDS.ProductDashboardSummary].sort()
    );
  });

  it('matches the product detail fields', () => {
    expect(sortedKeys(buildProductDetail())).toEqual(
      [...API_FIELDS.ProductDetailResponse].sort()
    );
  });

  it('matches the price history record fields', () => {
    expect(sortedKeys(buildHistoryPoint())).toEqual(
      [...API_FIELDS.ProductHistResponse].sort()
    );
  });

  it('matches the daily check status fields', () => {
    expect(sortedKeys(buildDailyCheck())).toEqual(
      [...API_FIELDS.DailyCheckStatusResponse].sort()
    );
  });
});

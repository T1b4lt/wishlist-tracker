import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import {
  buildDashboardProduct,
  buildHistoryPoint,
  buildOfferDetail,
  buildOfferSummary,
  buildProductDetail
} from '../../e2e/fixtures/products';
import { buildDailyCheck } from '../../e2e/fixtures/dailyCheck';

// Frontend side of the shared contracts (see `contracts/README.md`); the
// backend side lives in `backend/tests/test_contracts.py`.

const API_FIELDS = readContract('api-fields.json');

const sortedKeys = (object) => Object.keys(object).sort();

describe('api-fields contract', () => {
  // The e2e fixtures stand in for the backend responses in every
  // Playwright spec, so they must have exactly the backend schema fields.
  it.skip('matches the dashboard summary fields', () => {
    expect(sortedKeys(buildDashboardProduct())).toEqual(
      [...API_FIELDS.ProductDashboardSummary].sort()
    );
  });

  it.skip('matches the product detail fields', () => {
    expect(sortedKeys(buildProductDetail())).toEqual(
      [...API_FIELDS.ProductDetailResponse].sort()
    );
  });

  it.skip('matches the offer summary fields', () => {
    expect(sortedKeys(buildOfferSummary())).toEqual(
      [...API_FIELDS.OfferSummary].sort()
    );
  });

  it.skip('matches the offer detail fields', () => {
    expect(sortedKeys(buildOfferDetail())).toEqual(
      [...API_FIELDS.OfferDetail].sort()
    );
  });

  it('matches the price history record fields', () => {
    expect(sortedKeys(buildHistoryPoint())).toEqual(
      [...API_FIELDS.OfferHistResponse].sort()
    );
  });

  it('matches the daily check status fields', () => {
    expect(sortedKeys(buildDailyCheck())).toEqual(
      [...API_FIELDS.DailyCheckStatusResponse].sort()
    );
  });
});

import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import { RANGE_ALL } from './productHistory';
import { computeProductOfferStats, selectBestOffer } from './bestOffer';

// Frontend side of `contracts/best-offer-cases.json`; the backend side is
// `backend/tests/test_best_offer_contract.py`.
const CONTRACT = readContract('best-offer-cases.json');

const toOffers = (testCase) =>
  testCase.offers.map((offer) => ({
    id: offer.offer_id,
    price_history: offer.history
  }));

const toRange = (windowDays) =>
  windowDays === null ? RANGE_ALL : String(windowDays);

describe('best-offer contract', () => {
  it.each(CONTRACT.cases.map((testCase) => [testCase.name, testCase]))(
    '%s',
    (_name, testCase) => {
      const stats = computeProductOfferStats(
        toOffers(testCase),
        toRange(testCase.window_days),
        testCase.now
      );

      expect(stats).toEqual({
        bestOfferId: testCase.expected.best_offer_id,
        isInStock: testCase.expected.is_in_stock,
        isAtLowest: testCase.expected.is_at_lowest
      });
      expect(selectBestOffer(toOffers(testCase))).toBe(
        testCase.expected.best_offer_id
      );
    }
  );
});

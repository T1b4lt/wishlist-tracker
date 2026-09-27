import { describe, expect, it } from 'vitest';
import { computeLowestAcrossOffers, findBestOfferSummary } from './bestOffer';

const NOW = 10_000_000;

describe('computeLowestAcrossOffers', () => {
  it('returns the cheapest in-stock record of any offer in the range', () => {
    const offers = [
      {
        id: 1,
        price_history: [{ price: 80, is_in_stock: true, timestamp: 9_000_000 }]
      },
      {
        id: 2,
        price_history: [
          { price: 70, is_in_stock: false, timestamp: 9_500_000 },
          { price: 90, is_in_stock: true, timestamp: 9_900_000 }
        ]
      }
    ];

    expect(computeLowestAcrossOffers(offers, '30', NOW)).toEqual({
      price: 80,
      timestamp: 9_000_000,
      offerId: 1
    });
  });

  it('keeps the most recent record on price ties', () => {
    const offers = [
      {
        id: 1,
        price_history: [{ price: 80, is_in_stock: true, timestamp: 9_000_000 }]
      },
      {
        id: 2,
        price_history: [{ price: 80, is_in_stock: true, timestamp: 9_100_000 }]
      }
    ];

    expect(computeLowestAcrossOffers(offers, '30', NOW).offerId).toBe(2);
  });

  it('is null without in-stock records in the range', () => {
    expect(
      computeLowestAcrossOffers([{ id: 1, price_history: [] }], '30', NOW)
    ).toBeNull();
  });
});

describe('findBestOfferSummary', () => {
  it('returns the offer named by best_offer_id', () => {
    const product = { best_offer_id: 2, offers: [{ id: 1 }, { id: 2 }] };
    expect(findBestOfferSummary(product)).toEqual({ id: 2 });
  });

  it('falls back to the first offer without a best offer', () => {
    const product = { best_offer_id: null, offers: [{ id: 1 }, { id: 2 }] };
    expect(findBestOfferSummary(product)).toEqual({ id: 1 });
  });

  it('is null without offers', () => {
    expect(
      findBestOfferSummary({ best_offer_id: null, offers: [] })
    ).toBeNull();
  });
});

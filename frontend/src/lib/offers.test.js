import { describe, expect, it } from 'vitest';
import { findBestOfferSummary } from './offers';

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

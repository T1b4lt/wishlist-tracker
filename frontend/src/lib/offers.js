/**
 * The dashboard row's best offer summary: the offer the backend picked
 * (`best_offer_id`), or the first one when the product has no best offer yet,
 * so "Open in store" always has a URL.
 *
 * @param {{ best_offer_id: number|null, offers: object[] }} product
 * @returns {object|null}
 */
export function findBestOfferSummary(product) {
  const offers = product?.offers ?? [];
  return (
    offers.find((offer) => offer.id === product.best_offer_id) ??
    offers[0] ??
    null
  );
}

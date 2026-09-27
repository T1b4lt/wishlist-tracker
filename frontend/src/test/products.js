/**
 * Test helper: turns a flat single-store dashboard row (the pre-offers
 * shape, with `url`, `store_*` and `last_checked_at` on the product) into a
 * dashboard-summary row with one offer, so component tests can keep
 * describing a single-store product with flat fields.
 *
 * @param {object} flat
 * @returns {object} The row with `offers` and `best_offer_id`.
 */
export function singleStoreProduct(flat) {
  const {
    url = 'https://example.com',
    store_id = null,
    store_name = null,
    store_domain = null,
    store_has_favicon = false,
    last_checked_at = null,
    ...product
  } = flat;
  const offerId = product.id ?? 1;
  return {
    ...product,
    best_offer_id: offerId,
    offers: [
      {
        id: offerId,
        url,
        store_id,
        store_name,
        store_domain,
        store_has_favicon,
        current_price: product.current_price ?? null,
        is_in_stock: product.is_in_stock ?? null,
        last_checked_at
      }
    ]
  };
}

/**
 * Test helper: turns a flat single-store product detail (the pre-offers
 * shape, with `url`, `store_*`, `current_price`, `is_in_stock`,
 * `last_checked_at` and `price_history` on the product) into a detail with
 * one offer.
 *
 * @param {object} flat
 * @returns {object} The detail with `offers`.
 */
export function singleStoreDetail(flat) {
  const {
    url = 'https://example.com',
    store_id = null,
    store_name = null,
    store_domain = null,
    store_has_favicon = false,
    current_price = null,
    is_in_stock = null,
    last_checked_at = null,
    price_history = [],
    ...product
  } = flat;
  return {
    ...product,
    offers: [
      {
        id: (product.id ?? 1) * 10,
        url,
        store_id,
        store_name,
        store_domain,
        store_has_favicon,
        current_price,
        is_in_stock,
        last_checked_at,
        price_history
      }
    ]
  };
}

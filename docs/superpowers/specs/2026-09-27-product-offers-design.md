# Product Offers (Same Product in Several Stores) — Design

- **Date:** 2026-09-27
- **Branch:** `feat/product-groups`
- **Status:** Approved in brainstorming, pending spec review

## 1. Goal

Today every tracked URL is a separate product. When the same item is tracked
in two stores, the dashboard counts it twice: 2 items and a total value that
adds both prices (e.g. 1378 € for what is really one purchase). This feature
splits a **product** (what the user wants to buy) from its **offers** (where
it can be bought). Each offer keeps its own URL, store, price history, stock
and daily check; the product owns the shared data (name, category, priority,
description) and is counted once, by its best offer.

### Success criteria

- A product tracked in N stores counts as **one item** on the dashboard, and
  the total value adds only its **best offer's** price.
- Every offer keeps its own price history, stock status, staleness and
  Telegram alerts.
- The user can:
  1. add another store to a product from its detail page;
  2. add a new URL as another store of an existing product from the "New
     product" dialog (manual choice, no automatic matching);
  3. merge two existing products into one, choosing whose shared data to
     keep;
  4. unlink an offer into a standalone product.
- The detail page shows every store, and the chart has one line per store.

### Constraints / decisions

- **No backward compatibility.** The project is in development; the database
  will be recreated. No migration code.
- **Every product has at least one offer.** A standalone product is a product
  with one offer: there is a single code path, no "grouped vs. ungrouped"
  special case.
- **All offers of a product share one currency.** Linking, adding or merging
  across currencies is rejected (HTTP 409). No currency conversion.
- **No automatic product matching** in the "New product" dialog.
- **No inline row expansion** on the dashboard: a tooltip lists the stores,
  and the detail page shows them in full.

## 2. Data model

`backend/src/models/database_models.py`:

| Table                | Change                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Product`            | Keeps `id, name, category_id, priority, description`. **Loses** `url`, `currency`, `store_id`.             |
| `Offer` (new)        | `id, product_id (FK product.id, ON DELETE CASCADE, indexed), url, store_id (FK store.id, indexed), currency` |
| `OfferHist`          | Replaces `ProductHist`: `offer_id (FK offer.id, ON DELETE CASCADE, indexed), price, is_in_stock, timestamp` |
| `PendingStatusRetry` | `product_id` → `offer_id` (FK offer.id, cascade, primary key).                                              |
| `DailyCheckRun`      | `total_products` → `total_offers`. `pending_at_limit` now counts offers.                                   |

`Store` and `Category` are unchanged. The seed data in
`backend/src/setup_backend.py` includes one product with two offers (e.g.
Thomann and Amazon) so the feature is visible right after setup.

## 3. Rules

Implemented in a new pure module `backend/src/services/best_offer.py` and
mirrored in `frontend/src/lib/bestOffer.js`. Both are pinned by
`contracts/best-offer-cases.json` (see §5.4). Per-offer statistics keep using
`price_stats.py` / `productHistory.js` unchanged.

### 3.1 Best offer

Among the offers **with at least one history record**, using each offer's
*current* record (newest of its full history):

1. the cheapest offer whose current record is **in stock**;
2. if none is in stock, the cheapest offer overall;
3. ties are broken by the most recent current record, then by lowest offer id
   (deterministic);
4. with no offer having history, there is no best offer (`null`).

### 3.2 Product-level metrics

| Metric             | Definition                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `current_price`    | Best offer's current price (`null` without best offer).                                                        |
| `currency`         | The product's currency (shared by all offers).                                                                 |
| `price_change_pct` | Best offer's `price_change_pct` over its own history (`price_stats.py`).                                        |
| `recent_prices`    | Best offer's window prices (sparkline), as today.                                                              |
| `is_in_stock`      | `true` if any offer's current record is in stock; `false` if every offer with history is out; `null` if none has history. |
| `is_at_lowest`     | Best offer is in stock and its price ≤ the lowest in-stock price of **any** offer inside the window.           |
| Stale              | The product is stale if **any** offer is stale (same 3-day rule as today, per offer's `last_checked_at`).      |

### 3.3 Dashboard summary strip

Unchanged code in `computeDashboardSummary`; it now receives one entry per
product with the metrics above, so items and total value count each product
once.

## 4. Backend behavior

### 4.1 Cronjob (`product_status_cronjob.py`)

- Iterates **offers** instead of products, least recently checked first (the
  rotation from the Gemini quota feature now rotates offers).
- Stores `OfferHist` records; one record per offer per local day.
- `PendingStatusRetry` and `DailyCheckRun` work per offer.
- Telegram price-drop and stock alerts are sent **per offer**, and their text
  now includes the store name (e.g. "Product: X — Store: Amazon"). The button
  links to that offer's URL.
- The daily report counts checks (offers), e.g. "3 checks left unchecked".

### 4.2 Store resolution

`_resolve_store` moves to the offer: creating an offer or changing its URL
resolves the store from the URL (reusing the candidate `store_id` from
extraction when it matches the domain), as today.

## 5. API

### 5.1 Products

| Endpoint                                | Behavior                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /products/`                       | Body `{name, category_id, priority, description, offer: {url, currency, store_id?}}`. Creates the product with its first offer.            |
| `GET /products/`                        | Products with their offers (lightweight).                                                                                                 |
| `GET /products/dashboard-summary`       | One `ProductDashboardSummary` per product (§5.3).                                                                                          |
| `GET /products/{id}`                    | `ProductDetailResponse` with every offer and its full history.                                                                            |
| `PATCH /products/{id}`                  | Shared fields only: `name, category_id, priority, description`.                                                                           |
| `DELETE /products/{id}`                 | Deletes the product, its offers and their history (cascade).                                                                              |
| `POST /products/{id}/merge`             | Body `{source_product_id, keep: "target" \| "source"}`. Moves every source offer (with history) into the target; if `keep == "source"`, copies the source's shared fields onto the target; deletes the source. Returns the target's detail. 400 when merging a product with itself, 404 for unknown ids, 409 when currencies differ or a source offer URL already exists in the target. |

### 5.2 Offers (new router `offer_router.py`, service `offer_service.py`)

| Endpoint                        | Behavior                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /products/{id}/offers`    | Body `{url, currency, store_id?}`. Adds a store. 409 if the currency differs from the product's or the URL already exists in it.       |
| `PATCH /offers/{id}`            | Body `{url}`. Changes the URL and re-resolves the store. 409 if the URL already exists in the product.                                 |
| `POST /offers/{id}/unlink`      | Creates a new product copying the shared fields and moves the offer (with history) into it. Returns the new product. 409 if it is the product's only offer. |
| `DELETE /offers/{id}`           | Deletes the offer and its history. 409 if it is the product's only offer (delete the product instead).                                 |

`POST /extract-product-info/` is unchanged. When adding a store, the frontend
only uses `currency` and `store` from its response.

### 5.3 Response schemas

`ProductDashboardSummary`:
`id, name, category_id, category_name, category_color, priority, currency,
current_price, price_change_pct, is_in_stock, is_at_lowest, recent_prices,
best_offer_id, offers`.

`OfferSummary` (items of `offers`):
`id, url, store_id, store_name, store_domain, store_has_favicon,
current_price, is_in_stock, last_checked_at`.

`ProductDetailResponse`:
`id, name, priority, category_id, category_name, category_color,
description, currency, offers`.

`OfferDetail` (items of `offers`): the `OfferSummary` fields plus
`price_history: ProductHistResponse[]` (renamed `OfferHistResponse`, same
fields `price, is_in_stock, timestamp`).

`DailyCheckStatusResponse`: `total_products` → `total_offers`; the other
fields keep their names and now count offers.

### 5.4 Contracts

- `contracts/api-fields.json`: updated for every schema above
  (`ProductDashboardSummary`, `OfferSummary`, `ProductDetailResponse`,
  `OfferDetail`, `OfferHistResponse`, `DailyCheckStatusResponse`).
- `contracts/best-offer-cases.json` (new): input offers (histories) + window +
  `now` → expected `best_offer_id`, product `is_in_stock` and `is_at_lowest`.
  Consumed by backend and frontend tests, like `price-stats-cases.json`.
- `contracts/README.md` documents the new file.

## 6. Frontend

### 6.1 API layer and stores

- `lib/api/products.js`: new payload for `createProduct`; new `mergeProducts`.
- `lib/api/offers.js` (new): `addOffer`, `updateOffer`, `unlinkOffer`,
  `deleteOffer`.
- `productsStore`: new actions for the above; each refreshes the affected
  products.

### 6.2 Dashboard (table and cards)

- The row shows the product with its best-offer metrics.
- Store cell: with one offer, the `StoreBadge` as today. With several, the best
  offer's `StoreBadge` plus a "+N" chip; hovering or focusing it opens a
  tooltip listing every store with price and stock, the best one marked.
- `StaleBadge` shows when any offer is stale; its tooltip names the stale
  store(s).
- "Open in store" opens the best offer's URL (the first offer when there is
  no best offer).
- Filters (`productFilters.js`):
  - store filter and search match if **any** offer matches;
  - stock "in" = product `is_in_stock === true`, "out" = `false`;
  - price range, price drops, lowest price and price sorting use the best
    offer's metrics;
  - "outdated" uses the product-level stale rule;
  - "last check" sorting uses the **oldest** `last_checked_at` among offers;
  - `getFilterOptions` collects stores from every offer.

### 6.3 Product detail page

- Header: shared fields; "Edit" edits only those (`ProductFormDialog` in edit
  mode no longer shows the URL).
- New **`OfferList`** section ("Stores"): one row per offer with store badge,
  current price, stock, last check and a "Best price" marker on the best
  offer. Per-row menu: open in store, edit URL, unlink, remove store. Unlink
  and remove are disabled (with tooltip) on the only offer. Remove asks for
  confirmation (`ConfirmDialog`).
- **"Add store"** button → `AddOfferDialog`: paste URL → extraction → preview
  of store and currency (extraction returns no price; the first price arrives
  with the next daily check) → confirm. Currency mismatch shows an inline error.
- **Chart** (`PriceHistoryChart`): one stepped line per offer, each with its
  own color, and a legend with favicon + store name. Out-of-stock periods are
  drawn as a dashed segment of that store's line instead of full-width bands.
- **Stats row** (selected range): "Current price" = best offer's, with its
  store; "Lowest in range" = minimum across all offers, with store and date;
  "Average" and "vs average" = best offer's.
- `StaleProductNotice` lists the stale stores.
- Menu gains **"Merge with…"** → `MergeProductDialog`: pick the other product
  (combobox, only same-currency products, excluding itself) → choose "Keep
  name, category, priority and description from: this product / the other
  product" → preview of the result (name, N stores) → confirm. Afterwards the
  page navigates to the resulting product.

### 6.4 New product dialog

- After extraction, an optional **"Same product as…"** combobox (empty by
  default).
- When a product is selected, the name, category, priority and description
  fields are hidden and a note reads "It will be added as another store of
  X". Saving calls `POST /products/{id}/offers`.
- Currency mismatch shows an inline error and blocks saving.

### 6.5 i18n

Every new string in `english.json` and `spanish.json`; `locales.test.js`
keeps both in sync.

## 7. Testing

- **Backend (pytest):** best-offer rules (contract cases); dashboard summary
  with multi-offer products; create product with offer; add / edit / unlink /
  delete offer including every 409; merge (both `keep` values, history moved,
  source deleted, 400/404/409); cronjob over offers (rotation, retries,
  per-offer alerts with store name, daily report counts); store resolution on
  offers; contract field tests.
- **Frontend (Vitest):** `bestOffer.js` (contract cases); `productFilters`
  with multi-offer products; dashboard "+N" chip and tooltip; `OfferList`
  actions and disabled states; `AddOfferDialog`; `MergeProductDialog`;
  "Same product as…" in `ProductFormDialog`; multi-line chart and legend;
  stats row; contract field tests.
- **E2E (Playwright):** mocked API fixtures updated with one product with two
  offers; smoke tests and visual snapshots regenerated.

## 8. Documentation

- `README.md`: feature table (new "Multiple Stores per Product" row, updated
  Store Detection / Dashboard wording), database schema and API reference.
- `backend/README.md` and `backend/db/README.md`: new tables and endpoints.
- `contracts/README.md`: `best-offer-cases.json`.
- Note that the database must be recreated.

## 9. Out of scope

- Automatic detection of the same product across stores.
- Currency conversion between offers.
- Inline expansion of dashboard rows.
- Per-offer priority or category.

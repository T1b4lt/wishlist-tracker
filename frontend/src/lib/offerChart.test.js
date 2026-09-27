import { describe, expect, it } from 'vitest';
import { buildOfferSeries, SERIES_COLORS, seriesYDomain } from './offerChart';

const record = (price, isInStock, timestamp) => ({
  price,
  is_in_stock: isInStock,
  timestamp
});

describe('buildOfferSeries', () => {
  it('builds one colored series per offer', () => {
    const series = buildOfferSeries(
      [
        {
          id: 1,
          store_name: 'Amazon',
          store_id: 1,
          store_has_favicon: true,
          price_history: [record(10, true, 1)]
        },
        {
          id: 2,
          store_name: 'Thomann',
          store_id: 2,
          store_has_favicon: false,
          price_history: [record(12, true, 1)]
        }
      ],
      null
    );

    expect(series.map((s) => [s.offerId, s.storeName, s.color])).toEqual([
      [1, 'Amazon', SERIES_COLORS[0]],
      [2, 'Thomann', SERIES_COLORS[1]]
    ]);
  });

  it('splits in-stock and out-of-stock steps so both segments connect', () => {
    const [series] = buildOfferSeries(
      [
        {
          id: 1,
          store_name: 'Amazon',
          price_history: [
            record(10, true, 1),
            record(11, false, 2),
            record(12, true, 3)
          ]
        }
      ],
      null
    );

    expect(
      series.points.map((p) => [p.inStockPrice, p.outOfStockPrice])
    ).toEqual([
      [10, null],
      [11, 11],
      [12, 12]
    ]);
  });

  it('computes one Y domain over every series', () => {
    const series = buildOfferSeries(
      [
        { id: 1, price_history: [record(100, true, 1)] },
        { id: 2, price_history: [record(200, true, 1)] }
      ],
      null
    );

    expect(seriesYDomain(series)).toEqual([90, 210]);
  });

  it('keeps only the points at or after the window start', () => {
    const [series] = buildOfferSeries(
      [
        {
          id: 1,
          price_history: [
            record(10, true, 1),
            record(11, true, 2),
            record(12, true, 3)
          ]
        }
      ],
      2
    );

    expect(series.points.map((p) => p.timestamp)).toEqual([2, 3]);
  });
});

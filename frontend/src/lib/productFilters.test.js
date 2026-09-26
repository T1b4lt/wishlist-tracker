import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  applyProductFilters,
  countActiveFilters,
  filterProducts,
  getFilterOptions,
  parseFilters,
  serializeFilters,
  sortProducts
} from './productFilters';

const product = (overrides = {}) => ({
  id: 1,
  name: 'Wireless Headphones',
  category_id: 1,
  category_name: 'Electronics',
  category_color: '#3B82F6',
  priority: 'medium',
  current_price: 100,
  price_change_60d: 0,
  is_in_stock: true,
  currency: 'EUR',
  store_id: 1,
  store_name: 'Amazon',
  recent_prices: [100],
  last_checked_at: 1000,
  ...overrides
});

const filters = (overrides = {}) => ({ ...DEFAULT_FILTERS, ...overrides });
const ids = (products) => products.map((p) => p.id);

describe('filterProducts', () => {
  it('returns every product with the default filters', () => {
    const products = [product({ id: 1 }), product({ id: 2 })];
    expect(ids(filterProducts(products, DEFAULT_FILTERS))).toEqual([1, 2]);
  });

  describe('query', () => {
    const products = [
      product({ id: 1, name: 'DJI Mini 5 Pro', store_name: 'Amazon' }),
      product({ id: 2, name: 'dji mini 5 pro', store_name: 'PcComponentes' }),
      product({ id: 3, name: 'GoPro Hero 13', store_name: 'DJI Store' }),
      product({ id: 4, name: 'Cámara instantánea', store_name: null })
    ];

    it('matches a case-insensitive substring of the name', () => {
      expect(
        ids(filterProducts(products, filters({ query: 'Mini 5' })))
      ).toEqual([1, 2]);
    });

    it('also matches the store name', () => {
      expect(ids(filterProducts(products, filters({ query: 'dji' })))).toEqual([
        1, 2, 3
      ]);
    });

    it('ignores accents in both the query and the product', () => {
      expect(
        ids(filterProducts(products, filters({ query: 'camara' })))
      ).toEqual([4]);
      expect(
        ids(filterProducts(products, filters({ query: 'INSTANTÁNEA' })))
      ).toEqual([4]);
    });

    it('ignores surrounding whitespace and treats a blank query as no filter', () => {
      expect(
        ids(filterProducts(products, filters({ query: '  gopro ' })))
      ).toEqual([3]);
      expect(filterProducts(products, filters({ query: '   ' }))).toHaveLength(
        4
      );
    });
  });

  it('keeps only the selected stores', () => {
    const products = [
      product({ id: 1, store_id: 1 }),
      product({ id: 2, store_id: 2 }),
      product({ id: 3, store_id: 3 }),
      product({ id: 4, store_id: null })
    ];
    expect(ids(filterProducts(products, filters({ stores: [1, 3] })))).toEqual([
      1, 3
    ]);
  });

  it('keeps only the selected categories', () => {
    const products = [
      product({ id: 1, category_id: 1 }),
      product({ id: 2, category_id: 2 })
    ];
    expect(ids(filterProducts(products, filters({ categories: [2] })))).toEqual(
      [2]
    );
  });

  it('keeps only the selected priorities, case-insensitively', () => {
    const products = [
      product({ id: 1, priority: 'High' }),
      product({ id: 2, priority: 'medium' }),
      product({ id: 3, priority: 'low' })
    ];
    expect(
      ids(filterProducts(products, filters({ priorities: ['high', 'low'] })))
    ).toEqual([1, 3]);
  });

  describe('stock', () => {
    const products = [
      product({ id: 1, is_in_stock: true }),
      product({ id: 2, is_in_stock: false }),
      product({ id: 3, is_in_stock: null })
    ];

    it('keeps only in-stock products for "in"', () => {
      expect(ids(filterProducts(products, filters({ stock: 'in' })))).toEqual([
        1
      ]);
    });

    it('keeps only out-of-stock products for "out"', () => {
      expect(ids(filterProducts(products, filters({ stock: 'out' })))).toEqual([
        2
      ]);
    });
  });

  describe('price range', () => {
    const products = [
      product({ id: 1, current_price: 50 }),
      product({ id: 2, current_price: 100 }),
      product({ id: 3, current_price: 150 }),
      product({ id: 4, current_price: null })
    ];

    it('applies an inclusive minimum', () => {
      expect(ids(filterProducts(products, filters({ minPrice: 100 })))).toEqual(
        [2, 3]
      );
    });

    it('applies an inclusive maximum', () => {
      expect(ids(filterProducts(products, filters({ maxPrice: 100 })))).toEqual(
        [1, 2]
      );
    });

    it('applies both bounds together', () => {
      expect(
        ids(filterProducts(products, filters({ minPrice: 60, maxPrice: 140 })))
      ).toEqual([2]);
    });
  });

  it('keeps only products whose price dropped when priceDrop is on', () => {
    const products = [
      product({ id: 1, price_change_60d: -5 }),
      product({ id: 2, price_change_60d: 0 }),
      product({ id: 3, price_change_60d: 3 }),
      product({ id: 4, price_change_60d: null })
    ];
    expect(ids(filterProducts(products, filters({ priceDrop: true })))).toEqual(
      [1]
    );
  });

  it('keeps only products at their lowest recent price when atLowest is on', () => {
    const products = [
      product({ id: 1, current_price: 90, recent_prices: [100, 90] }),
      product({ id: 2, current_price: 100, recent_prices: [90, 100] }),
      product({ id: 3, current_price: 100, recent_prices: [] })
    ];
    expect(ids(filterProducts(products, filters({ atLowest: true })))).toEqual([
      1
    ]);
  });

  it('combines every filter with AND', () => {
    const products = [
      product({ id: 1, name: 'DJI Mini', store_id: 1, is_in_stock: true }),
      product({ id: 2, name: 'DJI Mini', store_id: 2, is_in_stock: true }),
      product({ id: 3, name: 'DJI Mini', store_id: 1, is_in_stock: false }),
      product({ id: 4, name: 'GoPro', store_id: 1, is_in_stock: true })
    ];
    expect(
      ids(
        filterProducts(
          products,
          filters({ query: 'dji', stores: [1], stock: 'in' })
        )
      )
    ).toEqual([1]);
  });
});

describe('sortProducts', () => {
  it('sorts by name A to Z by default, ignoring case', () => {
    const products = [
      product({ id: 1, name: 'b' }),
      product({ id: 2, name: 'C' }),
      product({ id: 3, name: 'A' })
    ];
    expect(ids(sortProducts(products, DEFAULT_FILTERS.sort))).toEqual([
      3, 1, 2
    ]);
  });

  it('does not mutate the input array', () => {
    const products = [
      product({ id: 1, name: 'b' }),
      product({ id: 2, name: 'a' })
    ];
    sortProducts(products, 'name_asc');
    expect(ids(products)).toEqual([1, 2]);
  });

  const priced = [
    product({ id: 1, name: 'a', current_price: 20 }),
    product({ id: 2, name: 'b', current_price: null }),
    product({ id: 3, name: 'c', current_price: 10 }),
    product({ id: 4, name: 'd', current_price: 30 })
  ];

  it('sorts by price ascending with missing prices last', () => {
    expect(ids(sortProducts(priced, 'price_asc'))).toEqual([3, 1, 4, 2]);
  });

  it('sorts by price descending with missing prices last', () => {
    expect(ids(sortProducts(priced, 'price_desc'))).toEqual([4, 1, 3, 2]);
  });

  it('sorts by price change with the biggest drops first', () => {
    const products = [
      product({ id: 1, price_change_60d: 5 }),
      product({ id: 2, price_change_60d: -20 }),
      product({ id: 3, price_change_60d: null }),
      product({ id: 4, price_change_60d: -3 })
    ];
    expect(ids(sortProducts(products, 'change_asc'))).toEqual([2, 4, 1, 3]);
  });

  it('sorts by priority from high to low, unknown last', () => {
    const products = [
      product({ id: 1, priority: 'low' }),
      product({ id: 2, priority: 'High' }),
      product({ id: 3, priority: 'weird' }),
      product({ id: 4, priority: 'medium' })
    ];
    expect(ids(sortProducts(products, 'priority_desc'))).toEqual([2, 4, 1, 3]);
  });

  it('sorts in-stock products first, then out of stock, then unknown', () => {
    const products = [
      product({ id: 1, is_in_stock: null }),
      product({ id: 2, is_in_stock: false }),
      product({ id: 3, is_in_stock: true })
    ];
    expect(ids(sortProducts(products, 'stock'))).toEqual([3, 2, 1]);
  });

  it('sorts by most recently checked first, never-checked last', () => {
    const products = [
      product({ id: 1, last_checked_at: 100 }),
      product({ id: 2, last_checked_at: null }),
      product({ id: 3, last_checked_at: 300 })
    ];
    expect(ids(sortProducts(products, 'checked_desc'))).toEqual([3, 1, 2]);
  });

  it('breaks ties by name so variants of the same product stay together', () => {
    const products = [
      product({ id: 1, name: 'Zeta', current_price: 10 }),
      product({ id: 2, name: 'Alpha', current_price: 10 })
    ];
    expect(ids(sortProducts(products, 'price_asc'))).toEqual([2, 1]);
  });

  it('falls back to name order for an unknown sort key', () => {
    const products = [
      product({ id: 1, name: 'b' }),
      product({ id: 2, name: 'a' })
    ];
    expect(ids(sortProducts(products, 'nope'))).toEqual([2, 1]);
  });
});

describe('applyProductFilters', () => {
  it('filters and then sorts', () => {
    const products = [
      product({ id: 1, name: 'DJI Mini', current_price: 900 }),
      product({ id: 2, name: 'GoPro', current_price: 300 }),
      product({ id: 3, name: 'DJI Mini', current_price: 800 })
    ];
    expect(
      ids(
        applyProductFilters(
          products,
          filters({ query: 'dji', sort: 'price_asc' })
        )
      )
    ).toEqual([3, 1]);
  });
});

describe('countActiveFilters', () => {
  it('is zero for the defaults', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts each active panel filter but not the query or sort', () => {
    expect(
      countActiveFilters(
        filters({
          query: 'dji',
          sort: 'price_asc',
          stores: [1, 2],
          categories: [1],
          priorities: ['high'],
          stock: 'in',
          minPrice: 10,
          maxPrice: null,
          priceDrop: true,
          atLowest: true
        })
      )
    ).toBe(7);
  });

  it('counts a price range with both bounds once', () => {
    expect(countActiveFilters(filters({ minPrice: 1, maxPrice: 2 }))).toBe(1);
  });
});

describe('getFilterOptions', () => {
  it('lists the distinct stores and categories, sorted by name', () => {
    const products = [
      product({
        store_id: 2,
        store_name: 'PcComponentes',
        category_id: 2,
        category_name: 'Drones',
        category_color: '#f00'
      }),
      product({
        store_id: 1,
        store_name: 'Amazon',
        category_id: 1,
        category_name: 'Electronics'
      }),
      product({
        store_id: 2,
        store_name: 'PcComponentes',
        category_id: 2,
        category_name: 'Drones',
        category_color: '#f00'
      }),
      product({ store_id: null, store_name: null })
    ];
    expect(getFilterOptions(products)).toEqual({
      stores: [
        { id: 1, name: 'Amazon' },
        { id: 2, name: 'PcComponentes' }
      ],
      categories: [
        { id: 2, name: 'Drones', color: '#f00' },
        { id: 1, name: 'Electronics', color: '#3B82F6' }
      ]
    });
  });
});

describe('URL round trip', () => {
  it('serializes the defaults to an empty string', () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('');
  });

  it('parses an empty query string to the defaults', () => {
    expect(parseFilters(new URLSearchParams(''))).toEqual(DEFAULT_FILTERS);
  });

  it('round-trips every filter', () => {
    const full = filters({
      query: 'dji mini',
      stores: [3, 5],
      categories: [1],
      priorities: ['high', 'low'],
      stock: 'out',
      minPrice: 10.5,
      maxPrice: 200,
      priceDrop: true,
      atLowest: true,
      sort: 'price_desc'
    });
    expect(parseFilters(new URLSearchParams(serializeFilters(full)))).toEqual(
      full
    );
  });

  it('produces readable, compact params', () => {
    expect(
      serializeFilters(
        filters({ query: 'dji', stores: [3, 5], sort: 'price_asc' })
      )
    ).toBe('q=dji&store=3%2C5&sort=price_asc');
  });

  it('ignores invalid values instead of failing', () => {
    expect(
      parseFilters(
        new URLSearchParams(
          'store=a,2&stock=maybe&min=abc&max=-&priority=urgent,high&sort=bogus&drop=yes'
        )
      )
    ).toEqual(filters({ stores: [2], priorities: ['high'] }));
  });
});

import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { singleStoreDetail } from '@/test/products';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { products as productsApi, config as configApi } from '@/lib/api';
import { useProductsStore, initialProductsState } from '@/stores/productsStore';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import { buildMultiStoreDetail } from '../../e2e/fixtures/products';
import ProductPage from './ProductPage';

// The edit and delete flows (each opens its own Ark dismissable layer, a
// Menu or a Dialog) live in their own files, `ProductPage.edit.test.jsx` and
// `ProductPage.delete.test.jsx`: see the note there for why.

vi.mock('@/lib/api', () => ({
  products: {
    get: vi.fn(),
    remove: vi.fn(),
    dashboardSummary: vi.fn()
  },
  config: {
    get: vi.fn(),
    update: vi.fn()
  },
  categories: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn()
  }
}));

// `PriceHistoryChart` already has its own full test file (recharts +
// range-filtering behavior); stubbed out here so this file's tests stay
// about the page's own composition (loading/error states, data flow). The
// stub still surfaces the `hasEnoughHistory`/`hasEnoughTotalHistory` props
// it was given, so this file
// can assert on *what ProductPage computed and passed down* (e.g. that a
// narrow range with too few points in it is treated the same as a genuinely
// new product) without needing the real chart to render.
vi.mock('@/components/product', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    PriceHistoryChart: ({
      hasEnoughHistory,
      hasEnoughTotalHistory,
      rangeKeys,
      onRangeChange
    }) => (
      <div
        data-testid="price-history-chart-stub"
        data-has-enough-history={String(hasEnoughHistory)}
        data-has-enough-total-history={String(hasEnoughTotalHistory)}
      >
        {rangeKeys?.map((key) => (
          <button key={key} type="button" onClick={() => onRangeChange(key)}>
            {`range-${key}`}
          </button>
        ))}
      </div>
    )
  };
});

const DAY = 60 * 60 * 24;

/** A full `ProductDetailResponse`-shaped fixture, timestamped relative to
 * "now" so the test never depends on wall-clock date. */
const buildProduct = (overrides = {}) => {
  const now = Date.now() / 1000;
  return singleStoreDetail({
    id: 7,
    name: 'Mechanical Keyboard',
    url: 'https://example.com/keyboard',
    priority: 'High',
    category_id: 3,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    description: 'A nice keyboard.',
    current_price: 95,
    is_in_stock: true,
    price_history: [
      { timestamp: now - 10 * DAY, price: 100, is_in_stock: true },
      { timestamp: now - 2 * DAY, price: 80, is_in_stock: true }
    ],
    currency: 'USD',
    last_checked_at: now - 3600,
    store_id: null,
    store_name: null,
    store_domain: null,
    store_has_favicon: false,
    ...overrides
  });
};

/** Renders `ProductPage` at `/product/<id>`, wired through wouter so
 * `useParams` behaves like it does in the real app. */
const renderProductPage = (id = 7) => {
  const { hook } = memoryLocation({ path: `/product/${id}` });
  return renderWithProviders(
    <Router hook={hook}>
      <Route path="/product/:productId" component={ProductPage} />
    </Router>
  );
};

beforeEach(() => {
  useProductsStore.setState(initialProductsState);
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
  configApi.get.mockResolvedValue({
    hist_window_size: 60,
    selected_language: 'english'
  });
  productsApi.dashboardSummary.mockResolvedValue([]);
});

describe('ProductPage', () => {
  it('shows the store badge and names the store on the store link', async () => {
    const getUnexpectedErrors = spyOnConsoleError();
    productsApi.get.mockResolvedValue(
      buildProduct({
        store_id: 7,
        store_name: 'Amazon',
        store_domain: 'amazon.es',
        store_has_favicon: true
      })
    );

    renderProductPage();

    expect(
      await screen.findByRole('link', { name: 'Open in Amazon' })
    ).toHaveAttribute('href', 'https://example.com/keyboard');
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('loads and renders the product: header, metadata, stats and description', async () => {
    const getUnexpectedErrors = spyOnConsoleError();
    productsApi.get.mockResolvedValue(buildProduct());

    renderProductPage();

    expect(
      await screen.findByRole('heading', { name: 'Mechanical Keyboard' })
    ).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    // Once in the header (the product) and once in its only store's row.
    expect(screen.getAllByText('In stock')).toHaveLength(2);
    // The current price, in the stats row and in the store's row.
    expect(screen.getAllByText('$95.00')).toHaveLength(2);
    expect(screen.getByTestId('price-history-chart-stub')).toHaveAttribute(
      'data-has-enough-history',
      'true'
    );
    expect(screen.getByText('A nice keyboard.')).toBeInTheDocument();
    // A real, single anchor (not a `<button>` nested inside an `<a>`), so it
    // keeps native link semantics (opening in a new tab, right-click menu).
    const storeLink = screen.getByRole('link', { name: 'Open store page' });
    expect(storeLink.tagName).toBe('A');
    expect(storeLink).toHaveAttribute('href', 'https://example.com/keyboard');
    expect(storeLink).toHaveAttribute('target', '_blank');
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('warns that the price has not been updated for days, with a link to the store page', async () => {
    const now = Date.now() / 1000;
    productsApi.get.mockResolvedValue(
      buildProduct({ last_checked_at: now - 4 * DAY - 60 })
    );

    renderProductPage();

    expect(
      await screen.findByText('Price not updated for 4 days')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Check the store page/ })
    ).toHaveAttribute('href', 'https://example.com/keyboard');
  });

  it('shows no outdated-price warning for a recently checked product', async () => {
    productsApi.get.mockResolvedValue(buildProduct());

    renderProductPage();

    expect(
      await screen.findByRole('heading', { name: 'Mechanical Keyboard' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Price not updated/)).not.toBeInTheDocument();
  });

  it('treats a range with fewer than 2 filtered points as "not enough history", even with plenty of lifetime history outside that range', async () => {
    productsApi.get.mockResolvedValue(
      buildProduct({
        // Plenty of history overall, but every record is well outside the
        // default 60-day range, so the *filtered* set has 0 points.
        price_history: [
          {
            timestamp: Date.now() / 1000 - 200 * DAY,
            price: 100,
            is_in_stock: true
          },
          {
            timestamp: Date.now() / 1000 - 190 * DAY,
            price: 90,
            is_in_stock: true
          },
          {
            timestamp: Date.now() / 1000 - 180 * DAY,
            price: 95,
            is_in_stock: true
          }
        ]
      })
    );

    renderProductPage();

    await screen.findByRole('heading', { name: 'Mechanical Keyboard' });
    const chart = screen.getByTestId('price-history-chart-stub');
    expect(chart).toHaveAttribute('data-has-enough-history', 'false');
    // ...but the lifetime history is long enough, so the chart can tell
    // "not enough data in this range" apart from "tracking just started".
    expect(chart).toHaveAttribute('data-has-enough-total-history', 'true');
  });

  it('shows a 404 page state that links back to the dashboard when the product is not found', async () => {
    // `productsStore.fetchDetail` logs the failed fetch itself (expected,
    // already covered by `productsStore.test.js`); silence it here instead
    // of asserting "no console.error" like the other tests.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notFoundError = new Error('not found');
    notFoundError.status = 404;
    productsApi.get.mockRejectedValue(notFoundError);

    renderProductPage(999);

    expect(await screen.findByText('Product not found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This product may have been deleted, or the link is incorrect.'
      )
    ).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: 'Back to wishlist' });
    expect(backLink).toHaveAttribute('href', '/');
    // No retry action for a definitively-missing product.
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error state for a non-404 failure', async () => {
    // Same as the 404 case: the store logs the failed fetch itself.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    productsApi.get.mockRejectedValueOnce(new Error('network down'));

    renderProductPage();

    expect(
      await screen.findByText("We couldn't load this product")
    ).toBeInTheDocument();

    productsApi.get.mockResolvedValueOnce(buildProduct());
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', { name: 'Mechanical Keyboard' })
    ).toBeInTheDocument();
    expect(productsApi.get).toHaveBeenCalledTimes(2);
  });

  it("shows the backend's lowest and average, and N/A without a change", async () => {
    const now = Math.floor(Date.now() / 1000);
    const product = buildProduct();
    productsApi.get.mockResolvedValue({
      ...product,
      default_range: '60',
      ranges: product.ranges.map((range) => ({
        ...range,
        average: 90,
        price_change_pct: null,
        lowest: { price: 80, timestamp: now - 2 * DAY, offer_id: 70 }
      }))
    });

    renderProductPage();

    const stat = async (label) =>
      (await screen.findByText(label)).parentElement;
    expect(await stat('Lowest in range')).toHaveTextContent('$80.00');
    expect(await stat('Average in range')).toHaveTextContent('$90.00');
    expect(await stat('Current vs average')).toHaveTextContent('N/A');
  });

  const backendRanges = [
    {
      key: '30',
      window_start: 0,
      average: 111,
      price_change_pct: -10,
      lowest: null
    },
    {
      key: '60',
      window_start: 0,
      average: 222,
      price_change_pct: 5,
      lowest: null
    },
    {
      key: '90',
      window_start: 0,
      average: 333,
      price_change_pct: null,
      lowest: null
    },
    {
      key: '180',
      window_start: 0,
      average: 444,
      price_change_pct: null,
      lowest: null
    },
    {
      key: 'all',
      window_start: null,
      average: 555,
      price_change_pct: null,
      lowest: null
    }
  ];

  it('shows the stats of the backend range, starting from its default', async () => {
    productsApi.get.mockResolvedValue(
      buildProduct({ default_range: '90', ranges: backendRanges })
    );

    renderProductPage();

    expect(await screen.findByText('$333.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'range-30' }));
    expect(screen.getByText('$111.00')).toBeInTheDocument();
  });

  it('keeps the range the user picked when the product is refetched', async () => {
    productsApi.get.mockResolvedValue(
      buildProduct({ default_range: '60', ranges: backendRanges })
    );
    renderProductPage();
    await screen.findByText('$222.00');
    await userEvent.click(screen.getByRole('button', { name: 'range-30' }));

    await act(() => useProductsStore.getState().fetchDetail('7'));

    expect(screen.getByText('$111.00')).toBeInTheDocument();
  });

  it('names the store of the lowest price the backend found', async () => {
    const detail = buildMultiStoreDetail();
    const ranges = detail.ranges.map((range) => ({
      ...range,
      lowest: { price: 150, timestamp: range.window_start ?? 0, offer_id: 2 }
    }));
    productsApi.get.mockResolvedValue({ ...detail, id: 7, ranges });

    renderProductPage();

    expect(await screen.findByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText(/at Thomann/i)).toBeInTheDocument();
  });

  it('lists every store and values the product by the best one', async () => {
    productsApi.get.mockResolvedValue(buildMultiStoreDetail());

    renderProductPage(3);

    expect(
      await screen.findByRole('heading', { name: 'Stores' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('at Amazon')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open in Amazon' })
    ).toHaveAttribute('href', 'https://example.com/headphones');
  });

  it('shows one outdated warning per stale store, naming it', async () => {
    const now = Date.now() / 1000;
    const detail = buildMultiStoreDetail();
    detail.offers[1] = {
      ...detail.offers[1],
      last_checked_at: now - 5 * DAY,
      days_since_check: 5,
      is_stale: true
    };
    productsApi.get.mockResolvedValue(detail);

    renderProductPage(3);

    expect(
      await screen.findByText(/^Thomann: price not updated for \d+ days$/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/^Amazon: price not updated/)
    ).not.toBeInTheDocument();
  });

  it('opens the "Add store" dialog from the stores card', async () => {
    productsApi.get.mockResolvedValue(buildProduct());

    renderProductPage();

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Add store' }));

    expect(
      await screen.findByText('Track Mechanical Keyboard in another store.')
    ).toBeInTheDocument();
  });
});

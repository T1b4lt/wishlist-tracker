import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { products as productsApi, config as configApi } from '@/lib/api';
import { useProductsStore, initialProductsState } from '@/stores/productsStore';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
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
    PriceHistoryChart: ({ hasEnoughHistory, hasEnoughTotalHistory }) => (
      <div
        data-testid="price-history-chart-stub"
        data-has-enough-history={String(hasEnoughHistory)}
        data-has-enough-total-history={String(hasEnoughTotalHistory)}
      />
    )
  };
});

const DAY = 60 * 60 * 24;

/** A full `ProductDetailResponse`-shaped fixture, timestamped relative to
 * "now" so the test never depends on wall-clock date. */
const buildProduct = (overrides = {}) => {
  const now = Date.now() / 1000;
  return {
    id: 7,
    name: 'Mechanical Keyboard',
    url: 'https://example.com/keyboard',
    priority: 'High',
    category_id: 3,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    description: 'A nice keyboard.',
    current_price: 95,
    min_price: 80,
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
  };
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
    expect(screen.getByText('In stock')).toBeInTheDocument();
    expect(screen.getByText('$95.00')).toBeInTheDocument();
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
});

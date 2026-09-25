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
import {
  useCategoriesStore,
  initialCategoriesState
} from '@/stores/categoriesStore';
import ProductPage from './ProductPage';

// Kept in its own file: opening `ProductFormDialog` here is one Ark
// dismissable-layer open/close cycle, and `ProductPage.delete.test.jsx`
// (the overflow `Menu` -> `ConfirmDialog`) is another. In jsdom, a second
// such cycle in the same module can race the first's async outside-click
// arming and swallow the interaction (the same jsdom-only quirk documented
// in `ProductRowActions.test.jsx`), so each flow gets its own file rather
// than sharing this one with `ProductPage.test.jsx` or each other.

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

vi.mock('@/components/product', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    PriceHistoryChart: () => <div data-testid="price-history-chart-stub" />
  };
});

const DAY = 60 * 60 * 24;

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
    ...overrides
  };
};

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
  useCategoriesStore.setState(initialCategoriesState);
  vi.clearAllMocks();
  configApi.get.mockResolvedValue({
    hist_window_size: 60,
    selected_language: 'english'
  });
  productsApi.dashboardSummary.mockResolvedValue([]);
});

describe('ProductPage edit action', () => {
  it('opens the edit dialog, prefilled with the product, from the Edit action', async () => {
    const user = userEvent.setup();
    const getUnexpectedErrors = spyOnConsoleError();
    productsApi.get.mockResolvedValue(buildProduct());

    renderProductPage();

    await screen.findByRole('heading', { name: 'Mechanical Keyboard' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(await screen.findByText('Edit product')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Item name' })).toHaveValue(
      'Mechanical Keyboard'
    );
    expect(getUnexpectedErrors()).toEqual([]);
  });
});

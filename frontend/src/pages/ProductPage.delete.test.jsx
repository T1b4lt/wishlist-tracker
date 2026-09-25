import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Route, Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { products as productsApi, config as configApi } from '@/lib/api';
import { useProductsStore, initialProductsState } from '@/stores/productsStore';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import { toaster } from '@/components/ui/toaster';
import ProductPage from './ProductPage';

// Kept in its own file: see the note in `ProductPage.edit.test.jsx` about
// only exercising one Ark dismissable-layer open/close cycle (here: the
// overflow `Menu` -> `ConfirmDialog`) per test file/module in jsdom.

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

vi.mock('@/components/ui/toaster', () => ({
  toaster: { create: vi.fn() }
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

const LocationProbe = () => {
  const [location] = useLocation();
  return <span data-testid="location">{location}</span>;
};

const renderProductPage = (id = 7) => {
  const { hook } = memoryLocation({ path: `/product/${id}` });
  return renderWithProviders(
    <Router hook={hook}>
      <LocationProbe />
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

describe('ProductPage delete action', () => {
  it('deletes the product via the overflow menu, toasts, and navigates to the dashboard', async () => {
    const user = userEvent.setup();
    const getUnexpectedErrors = spyOnConsoleError();
    productsApi.get.mockResolvedValue(buildProduct());
    productsApi.remove.mockResolvedValue(null);

    renderProductPage();

    await screen.findByRole('heading', { name: 'Mechanical Keyboard' });

    await user.click(
      screen.getByRole('button', {
        name: 'More actions for Mechanical Keyboard'
      })
    );
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    expect(await screen.findByText('Delete Product')).toBeInTheDocument();

    await user.click(
      screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0]
    );

    await waitFor(() => expect(productsApi.remove).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/')
    );
    expect(toaster.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Product deleted' })
    );
    expect(getUnexpectedErrors()).toEqual([]);
  });
});

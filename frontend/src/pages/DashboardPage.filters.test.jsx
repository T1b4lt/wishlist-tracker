import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { products as productsApi, config as configApi } from '@/lib/api';
import { useProductsStore, initialProductsState } from '@/stores/productsStore';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import DashboardPage from './DashboardPage';

vi.mock('@/lib/api', () => ({
  products: {
    dashboardSummary: vi.fn(),
    remove: vi.fn()
  },
  config: {
    get: vi.fn()
  }
}));

const product = (overrides) => ({
  url: 'https://example.com',
  category_id: 1,
  category_name: 'Drones',
  category_color: '#3B82F6',
  priority: 'High',
  price_change_60d: 0,
  is_in_stock: true,
  currency: 'EUR',
  store_domain: null,
  store_has_favicon: false,
  recent_prices: [],
  last_checked_at: null,
  ...overrides
});

const PRODUCTS = [
  product({
    id: 1,
    name: 'DJI Mini 5 Pro',
    store_id: 1,
    store_name: 'Amazon',
    current_price: 999
  }),
  product({
    id: 2,
    name: 'DJI Mini 5 Pro',
    store_id: 2,
    store_name: 'PcComponentes',
    current_price: 949
  }),
  product({
    id: 3,
    name: 'Sony WH-1000XM6',
    store_id: 1,
    store_name: 'Amazon',
    current_price: 399
  })
];

const renderDashboard = (path = '/') => {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <DashboardPage />
    </Router>
  );
  return { location, user: userEvent.setup() };
};

/** Product names in table order (the card list duplicates them in jsdom). */
const tableNames = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0].textContent);

beforeEach(() => {
  useProductsStore.setState(initialProductsState);
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
  configApi.get.mockResolvedValue({ hist_window_size: 60 });
  productsApi.dashboardSummary.mockResolvedValue(PRODUCTS);
});

describe('DashboardPage search and filters', () => {
  it('filters the list live as the user types', async () => {
    const { user } = renderDashboard();
    await screen.findByRole('table');
    expect(tableNames()).toHaveLength(3);

    await user.type(screen.getByRole('searchbox'), 'dji');

    // Removed rows play their exit animation before unmounting.
    await waitFor(() =>
      expect(tableNames()).toEqual(['DJI Mini 5 Pro', 'DJI Mini 5 Pro'])
    );
    expect(screen.getByText('Showing 2 of 3 products')).toBeInTheDocument();
  });

  it('restores the filters and sort order from the URL', async () => {
    renderDashboard('/?q=dji&sort=price_asc');
    await screen.findByRole('table');

    expect(screen.getByRole('searchbox')).toHaveValue('dji');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('PcComponentes')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Amazon')).toBeInTheDocument();
  });

  it('keeps the summary strip on every product while filtering', async () => {
    renderDashboard('/?q=sony');
    await screen.findByRole('table');

    const itemsStat = screen.getByText('Items').parentElement;
    expect(within(itemsStat).getByText('3')).toBeInTheDocument();
  });

  it('shows a "no results" state that clears the filters', async () => {
    const { user, location } = renderDashboard('/?q=gopro&sort=price_desc');

    expect(
      await screen.findByText('No products match your search')
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(tableNames()).toHaveLength(3);
    expect(location.history.at(-1)).toBe('/?sort=price_desc');
  });
});

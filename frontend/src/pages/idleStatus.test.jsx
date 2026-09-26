import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import { useProductsStore, initialProductsState } from '@/stores/productsStore';
import {
  useCategoriesStore,
  initialCategoriesState
} from '@/stores/categoriesStore';
import DashboardPage from './DashboardPage';
import CategoriesPage from './CategoriesPage';

// Regression test for a final-review finding: a store's `'idle'` status
// (before the page's first fetch has even started) used to be read as
// "loaded, zero items", flashing the empty state for a frame. Each store's
// fetch is replaced with a no-op here, so the pages stay on that very first
// `'idle'` render for the whole test.

vi.mock('@/lib/api', () => {
  /** Never settles: nothing in this file should reach the network. */
  const pending = () => new Promise(() => {});
  return {
    config: { get: vi.fn(pending), update: vi.fn(pending) },
    products: {
      dashboardSummary: vi.fn(pending),
      get: vi.fn(pending),
      create: vi.fn(pending),
      update: vi.fn(pending),
      remove: vi.fn(pending)
    },
    categories: {
      list: vi.fn(pending),
      create: vi.fn(pending),
      update: vi.fn(pending),
      remove: vi.fn(pending)
    }
  };
});

beforeEach(() => {
  useConfigStore.setState({ ...initialConfigState, fetch: vi.fn() });
  useProductsStore.setState({ ...initialProductsState, fetchSummary: vi.fn() });
  useCategoriesStore.setState({ ...initialCategoriesState, fetch: vi.fn() });
});

describe('pages before their first fetch (idle status)', () => {
  it('Dashboard shows its loading state, not the empty state', () => {
    const { hook } = memoryLocation({ path: '/' });
    renderWithProviders(
      <Router hook={hook}>
        <DashboardPage />
      </Router>
    );

    expect(useProductsStore.getState().status).toBe('idle');
    expect(
      screen.queryByText('No products in your wishlist yet')
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('Categories shows its loading state, not the empty state', () => {
    const { hook } = memoryLocation({ path: '/categories' });
    renderWithProviders(
      <Router hook={hook}>
        <CategoriesPage />
      </Router>
    );

    expect(useCategoriesStore.getState().status).toBe('idle');
    expect(
      screen.queryByText(
        'No categories yet. Create your first category to get started!'
      )
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });
});

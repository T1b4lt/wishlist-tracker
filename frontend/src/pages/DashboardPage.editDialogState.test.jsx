import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { products as productsApi, config as configApi } from '@/lib/api';
import { useProductsStore, initialProductsState } from '@/stores/productsStore';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import DashboardPage from './DashboardPage';

// Regression test for a Task 15 review finding: `DashboardPage` used to
// clear `editingProduct` in `handleCloseForm`, which flips
// `ProductFormDialog`'s `mode`/`product` props from "edit" to "create"
// while the dialog is still playing its close animation (it stays mounted,
// just `open=false`, until then), so its title/buttons briefly showed
// "add" copy for what was actually an edit. The fix clears `editingProduct`
// on *open* instead (`handleAddProduct`/`handleEditProduct`), not on close.
//
// `ProductFormDialog` is stubbed with a "Close" button wired straight to
// its `onClose` prop, so this exercises `DashboardPage`'s own state
// transitions directly, with no dialog animation timing involved.

vi.mock('@/lib/api', () => ({
  products: {
    dashboardSummary: vi.fn(),
    remove: vi.fn()
  },
  config: {
    get: vi.fn()
  }
}));

vi.mock('@/components/products', () => ({
  ProductFormDialog: ({ open, onClose, mode, product }) => (
    <div data-testid="product-form-dialog-stub">
      <span data-testid="open">{String(open)}</span>
      <span data-testid="mode">{mode}</span>
      <span data-testid="product-name">{product?.name ?? 'none'}</span>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  )
}));

// `ProductTable`/`ProductCardList` both render, unfiltered by CSS media
// queries, in jsdom; stubbing them to a single plain "Edit" button avoids
// the ambiguity of two identical actions menus and lets this test call
// `onEdit` directly, without going through a Chakra `Menu`.
vi.mock('@/components/dashboard', () => ({
  DashboardSummary: () => null,
  ProductFilterBar: () => null,
  ProductTable: ({ products, onEdit }) => (
    <button type="button" onClick={() => onEdit(products[0], null)}>
      Edit first product
    </button>
  ),
  ProductCardList: () => null
}));

const PRODUCT = { id: 7, name: 'Mechanical Keyboard' };

beforeEach(() => {
  useProductsStore.setState(initialProductsState);
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
  configApi.get.mockResolvedValue({ hist_window_size: 60 });
  productsApi.dashboardSummary.mockResolvedValue([PRODUCT]);
});

describe('DashboardPage edit dialog state', () => {
  it('keeps mode/product as "edit" while closing, only resetting to "create" on the next Add', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);

    await user.click(await screen.findByText('Edit first product'));

    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(screen.getByTestId('mode')).toHaveTextContent('edit');
    expect(screen.getByTestId('product-name')).toHaveTextContent(
      'Mechanical Keyboard'
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Still "edit" / the same product: only `open` flipped. A dialog that
    // is still mounted while it plays its close animation must not show
    // "add" copy for what was an edit a moment ago.
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(screen.getByTestId('mode')).toHaveTextContent('edit');
    expect(screen.getByTestId('product-name')).toHaveTextContent(
      'Mechanical Keyboard'
    );

    await user.click(screen.getByRole('button', { name: 'Add product' }));

    // Only a fresh "Add" resets it to create mode.
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(screen.getByTestId('mode')).toHaveTextContent('create');
    expect(screen.getByTestId('product-name')).toHaveTextContent('none');
  });
});

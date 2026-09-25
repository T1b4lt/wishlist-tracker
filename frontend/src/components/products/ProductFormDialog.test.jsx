import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import {
  products as productsApi,
  categories as categoriesApi
} from '@/lib/api';
import { useProductsStore, initialProductsState } from '@/stores/productsStore';
import {
  useCategoriesStore,
  initialCategoriesState
} from '@/stores/categoriesStore';
import { ProductFormDialog } from './ProductFormDialog';

vi.mock('@/lib/api', () => ({
  products: {
    extractInfo: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    dashboardSummary: vi.fn()
  },
  categories: {
    list: vi.fn(),
    create: vi.fn()
  }
}));

const ELECTRONICS = { id: 5, name: 'Electronics', color: '#3B82F6' };

/** Backs the `categoriesApi` mocks so a created category is reflected by
 * the next `list()` call, the way the real backend would behave. */
let categoryList;

beforeEach(() => {
  useProductsStore.setState(initialProductsState);
  useCategoriesStore.setState(initialCategoriesState);
  vi.clearAllMocks();
  categoryList = [ELECTRONICS];
  categoriesApi.list.mockImplementation(() => Promise.resolve(categoryList));
  productsApi.dashboardSummary.mockResolvedValue([]);
  // Safe default so the debounced auto-extraction never corrupts a test
  // that is not exercising it (a real network call would never resolve
  // fast enough in jsdom anyway, but this keeps it inert if it fires).
  productsApi.extractInfo.mockResolvedValue({
    name: '',
    description: '',
    category: '',
    currency: ''
  });
});

describe('ProductFormDialog', () => {
  it('shows inline validation errors when the form is submitted empty', async () => {
    const user = userEvent.setup();
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );

    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(screen.getByText('Enter a product URL.')).toBeInTheDocument();
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Select a category.')).toBeInTheDocument();
    expect(productsApi.create).not.toHaveBeenCalled();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  // The only test in this file that opens the category `Select` and the
  // "new category" `Popover`: Chakra `Menu`s in jsdom were previously found
  // to only reliably open once per test file, and the same dismissable-layer
  // machinery backs `Select`/`Combobox`/`Popover`, so this keeps every other
  // test free of that risk.
  it('creates a new category through the popover, then creates the product', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const getUnexpectedErrors = spyOnConsoleError();

    productsApi.create.mockResolvedValue({ id: 42, name: 'Standing Desk' });
    categoriesApi.create.mockImplementation((data) => {
      const created = { id: 9, ...data };
      categoryList = [...categoryList, created];
      return Promise.resolve(created);
    });

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={onClose} product={null} />
    );

    // Reveal the rest of the fields without touching the URL yet, so the
    // debounced auto-extraction has nothing to schedule while the category
    // popover is used below.
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await user.type(
      screen.getByRole('textbox', { name: 'Item name' }),
      'Standing Desk'
    );

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(
      await screen.findByRole('option', { name: 'New category' })
    );

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Furniture');
    await user.click(screen.getByRole('button', { name: 'Create category' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Create category' })
      ).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Category' })
      ).toHaveTextContent('Furniture')
    );

    // Fill the URL last and submit immediately, so the pending 500ms
    // auto-extraction timer has as little time as possible to fire before
    // the test (and this render) is torn down.
    await user.type(
      screen.getByRole('textbox', { name: 'Product URL' }),
      'https://example.com/desk'
    );
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(productsApi.create).toHaveBeenCalledTimes(1));
    expect(productsApi.create).toHaveBeenCalledWith({
      name: 'Standing Desk',
      url: 'https://example.com/desk',
      priority: 'Medium',
      category_id: 9,
      description: '',
      currency: 'EUR'
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('extracts details via the Generate button and matches an existing category by name', async () => {
    const user = userEvent.setup();
    const getUnexpectedErrors = spyOnConsoleError();

    productsApi.extractInfo.mockResolvedValue({
      name: 'Standing Desk',
      description: 'A nice desk',
      category: 'electronics',
      currency: 'usd'
    });

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Product URL' }),
      'https://example.com/desk'
    );
    await user.click(screen.getByRole('button', { name: 'Generate Details' }));

    expect(
      await screen.findByDisplayValue('Standing Desk')
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('A nice desk')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Category' })
    ).toHaveTextContent('Electronics');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue(
      'USD · $'
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('prefills from a full product in edit mode and submits an update', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const getUnexpectedErrors = spyOnConsoleError();

    const fullProduct = {
      id: 7,
      name: 'Mechanical Keyboard',
      url: 'https://example.com/keyboard',
      description: 'A nice keyboard',
      category_id: 5,
      category_name: 'Electronics',
      category_color: '#3B82F6',
      priority: 'High',
      currency: 'EUR'
    };
    productsApi.update.mockResolvedValue(fullProduct);
    productsApi.get.mockResolvedValue(fullProduct);

    renderWithProviders(
      <ProductFormDialog
        open
        mode="edit"
        onClose={onClose}
        product={fullProduct}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Product URL' })).toHaveValue(
      'https://example.com/keyboard'
    );
    expect(screen.getByRole('textbox', { name: 'Item name' })).toHaveValue(
      'Mechanical Keyboard'
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'A nice keyboard'
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Category' })
      ).toHaveTextContent('Electronics')
    );
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue(
      'EUR · €'
    );
    expect(screen.getByRole('radio', { name: 'High' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(productsApi.update).toHaveBeenCalledTimes(1));
    expect(productsApi.update).toHaveBeenCalledWith(7, {
      name: 'Mechanical Keyboard',
      url: 'https://example.com/keyboard',
      priority: 'High',
      category_id: 5,
      description: 'A nice keyboard',
      currency: 'EUR'
    });
    // The cached product detail (Task 12's product page) is refreshed after
    // a successful edit so it does not keep showing stale data.
    expect(productsApi.get).toHaveBeenCalledWith(7);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('loads the full product when given a lighter record, showing a skeleton first', async () => {
    const getUnexpectedErrors = spyOnConsoleError();

    // Shaped like a dashboard summary row: no `description`.
    const summaryProduct = {
      id: 11,
      name: 'Desk Lamp',
      url: 'https://example.com/lamp',
      category_id: 3,
      category_name: 'Lighting',
      category_color: '#EAB308',
      priority: 'Low',
      currency: 'USD'
    };
    let resolveGet;
    productsApi.get.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      })
    );

    renderWithProviders(
      <ProductFormDialog
        open
        mode="edit"
        onClose={vi.fn()}
        product={summaryProduct}
      />
    );

    expect(
      screen.queryByRole('textbox', { name: 'Item name' })
    ).not.toBeInTheDocument();
    expect(productsApi.get).toHaveBeenCalledWith(11);

    resolveGet({ ...summaryProduct, description: 'A warm desk lamp' });

    expect(
      await screen.findByRole('textbox', { name: 'Item name' })
    ).toHaveValue('Desk Lamp');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'A warm desk lamp'
    );
    expect(getUnexpectedErrors()).toEqual([]);
  });
});

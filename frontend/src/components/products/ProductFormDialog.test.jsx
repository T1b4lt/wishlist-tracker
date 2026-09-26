import {
  act,
  fireEvent,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { Provider } from '@/components/ui/provider';
import i18n from '@/i18n/index.js';
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
import { toaster } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/client';
import { ProductFormDialog } from './ProductFormDialog';

/** Same wrapping as `renderWithProviders`, for `rerender` calls (which
 * replace the whole tree `render` was given, so it has to be reapplied). */
const wrap = (ui) => (
  <Provider>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </Provider>
);

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

vi.mock('@/components/ui/toaster', () => ({
  toaster: { create: vi.fn() }
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
  const AMAZON = {
    id: 7,
    name: 'Amazon',
    domain: 'amazon.es',
    has_favicon: true
  };

  it('shows the extracted store read-only and sends its id on create', async () => {
    const user = userEvent.setup();
    const getUnexpectedErrors = spyOnConsoleError();
    productsApi.extractInfo.mockResolvedValue({
      name: 'Standing Desk',
      description: 'A nice desk',
      category: 'Electronics',
      currency: 'EUR',
      store: AMAZON
    });
    productsApi.create.mockResolvedValue({ id: 1, name: 'Standing Desk' });

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Product URL' }),
      'https://www.amazon.es/desk'
    );
    await user.click(screen.getByRole('button', { name: 'Generate details' }));
    await screen.findByDisplayValue('Standing Desk');

    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /store/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(productsApi.create).toHaveBeenCalled());
    expect(productsApi.create.mock.calls[0][0]).toMatchObject({ store_id: 7 });
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('clears the extracted store when the URL changes', async () => {
    const user = userEvent.setup();
    productsApi.extractInfo.mockResolvedValue({
      name: 'Standing Desk',
      description: '',
      category: 'Electronics',
      currency: 'EUR',
      store: AMAZON
    });

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );

    const urlInput = screen.getByRole('textbox', { name: 'Product URL' });
    await user.type(urlInput, 'https://www.amazon.es/desk');
    await user.click(screen.getByRole('button', { name: 'Generate details' }));
    await screen.findByText('Amazon');

    await user.type(urlInput, 'x');

    expect(screen.queryByText('Amazon')).not.toBeInTheDocument();
  });

  it('shows the product store read-only in edit mode', async () => {
    renderWithProviders(
      <ProductFormDialog
        open
        mode="edit"
        onClose={vi.fn()}
        product={{
          id: 3,
          name: 'Desk',
          url: 'https://amazon.es/desk',
          description: 'A desk',
          category_id: 5,
          priority: 'Medium',
          currency: 'EUR',
          store_id: 7,
          store_name: 'Amazon',
          store_has_favicon: true
        }}
      />
    );

    expect(await screen.findByText('Amazon')).toBeInTheDocument();
  });

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
    await user.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Add category' })
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
    // Its own key, not borrowed from `pages.dashboard.menu.open`, even
    // though it renders the same "Open" text today.
    expect(toaster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Open' })
      })
    );
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
    await user.click(screen.getByRole('button', { name: 'Generate details' }));

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
    // A successful extraction clears the error, so the button still reads
    // "Generate details", not "Retry" (that label is reserved for a failed
    // attempt; see the next test).
    expect(
      screen.getByRole('button', { name: 'Generate details' })
    ).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('shows Retry only after a failed extraction attempt, reverting to Generate details on the next success', async () => {
    const user = userEvent.setup();
    // Extraction logs its own failure (expected here, already covered by
    // other extraction-error tests): silence it instead of asserting no
    // console.error, since this test intentionally triggers one.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    productsApi.extractInfo
      .mockRejectedValueOnce(new Error('extraction failed'))
      .mockResolvedValueOnce({
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
    await user.click(screen.getByRole('button', { name: 'Generate details' }));

    const retryButton = await screen.findByRole('button', { name: 'Retry' });
    expect(
      screen.getByText(
        'We could not extract details from that URL. You can fill them in manually or try again.'
      )
    ).toBeInTheDocument();

    await user.click(retryButton);

    expect(
      await screen.findByRole('button', { name: 'Generate details' })
    ).toBeInTheDocument();
  });

  it('asks the user to add a category when extraction fails because none exist', async () => {
    const user = userEvent.setup();
    // Extraction logs its own failure: silence it (see the Retry test).
    vi.spyOn(console, 'error').mockImplementation(() => {});

    categoryList = [];
    productsApi.extractInfo.mockRejectedValue(
      new ApiError(
        'No categories found in database. Please create categories first.',
        { status: 400 }
      )
    );

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );
    await waitFor(() => expect(categoriesApi.list).toHaveBeenCalled());

    await user.type(
      screen.getByRole('textbox', { name: 'Product URL' }),
      'https://example.com/desk'
    );
    await user.click(screen.getByRole('button', { name: 'Generate details' }));

    expect(
      await screen.findByText(
        'You need at least one category before details can be extracted. Add one with the Category field below, then try again.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'We could not extract details from that URL. You can fill them in manually or try again.'
      )
    ).not.toBeInTheDocument();
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

  it('renders the priority control with PriorityBadge icon and weight visuals', () => {
    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );

    const highRadio = screen.getByRole('radio', { name: 'High' });
    const highLabel = document.getElementById(
      highRadio.getAttribute('aria-labelledby')
    );
    expect(highLabel.querySelector('svg')).toBeTruthy();
    expect(
      getComputedStyle(within(highLabel).getByText('High')).fontWeight
    ).toBe('var(--chakra-font-weights-bold)');

    const lowRadio = screen.getByRole('radio', { name: 'Low' });
    const lowLabel = document.getElementById(
      lowRadio.getAttribute('aria-labelledby')
    );
    expect(lowLabel.querySelector('svg')).toBeTruthy();
    expect(getComputedStyle(within(lowLabel).getByText('Low')).fontWeight).toBe(
      'var(--chakra-font-weights-normal)'
    );
  });

  it('aborts an in-flight extraction on close, so a stale result cannot land in a reopened form', async () => {
    vi.useFakeTimers();
    try {
      const getUnexpectedErrors = spyOnConsoleError();

      let resolveExtract;
      productsApi.extractInfo.mockReturnValue(
        new Promise((resolve) => {
          resolveExtract = resolve;
        })
      );

      const { rerender } = renderWithProviders(
        wrap(
          <ProductFormDialog
            open
            mode="create"
            onClose={vi.fn()}
            product={null}
          />
        )
      );

      // `fireEvent` (a single synchronous native event), not `userEvent`
      // (which schedules its own real-time-based delays internally and
      // hangs forever once `vi.useFakeTimers()` is active).
      fireEvent.change(screen.getByRole('textbox', { name: 'Product URL' }), {
        target: { value: 'https://example.com/a' }
      });
      // Let the 500ms debounce fire the (still-pending) extraction.
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(productsApi.extractInfo).toHaveBeenCalledTimes(1);

      // Close the dialog while that extraction is still in flight.
      act(() => {
        rerender(
          wrap(
            <ProductFormDialog
              open={false}
              mode="create"
              onClose={vi.fn()}
              product={null}
            />
          )
        );
      });

      // The stale extraction now resolves - it must be ignored.
      resolveExtract({
        name: 'Stale Name',
        description: 'Stale description',
        category: '',
        currency: ''
      });
      await act(() => vi.advanceTimersByTimeAsync(0));

      // Reopen fresh.
      act(() => {
        rerender(
          wrap(
            <ProductFormDialog
              open
              mode="create"
              onClose={vi.fn()}
              product={null}
            />
          )
        );
      });

      // Give the stale promise's `.then` one more chance to run (it
      // shouldn't do anything, but if it did, this is when it would).
      await act(() => vi.advanceTimersByTimeAsync(0));

      // The reopened form is a clean slate (create mode always resets on
      // reopen): the stale extraction's values are nowhere to be found,
      // and the fields it would have populated are not even revealed yet
      // (nothing was attempted in this fresh instance).
      expect(screen.queryByDisplayValue('Stale Name')).not.toBeInTheDocument();
      expect(
        screen.queryByDisplayValue('Stale description')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: 'Item name' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Product URL' })).toHaveValue(
        ''
      );
      expect(getUnexpectedErrors()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses an already-cached, successful detail record without refetching or flashing a skeleton', () => {
    const cachedLamp = {
      id: 11,
      name: 'Desk Lamp',
      url: 'https://example.com/lamp',
      description: 'A warm desk lamp',
      category_id: 3,
      category_name: 'Lighting',
      category_color: '#EAB308',
      priority: 'Low',
      currency: 'USD'
    };
    useProductsStore.setState({
      details: { 11: { status: 'success', error: null, data: cachedLamp } }
    });

    // A lighter prop (no `description`), same shape the dashboard summary
    // passes - only `details[11]` (pre-seeded above) has the full record.
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

    renderWithProviders(
      <ProductFormDialog
        open
        mode="edit"
        onClose={vi.fn()}
        product={summaryProduct}
      />
    );

    // Available immediately - no skeleton phase - and never refetched.
    expect(screen.getByRole('textbox', { name: 'Item name' })).toHaveValue(
      'Desk Lamp'
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'A warm desk lamp'
    );
    expect(productsApi.get).not.toHaveBeenCalled();
  });
});

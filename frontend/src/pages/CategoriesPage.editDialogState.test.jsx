import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { categories as categoriesApi } from '@/lib/api';
import {
  useCategoriesStore,
  initialCategoriesState
} from '@/stores/categoriesStore';
import CategoriesPage from './CategoriesPage';

// Regression test for a Task 15 review finding: `CategoriesPage` used to
// clear `editingCategory` in `handleCloseForm`, which flips
// `CategoryFormDialog`'s `category` prop (and so its title/buttons) from
// "edit" to "add" copy while the dialog is still playing its close
// animation (it stays mounted, just `open=false`, until then). The fix
// clears `editingCategory` on *open* instead (`handleAddCategory`/
// `handleEditCategory`), not on close.
//
// `CategoryFormDialog` is stubbed with a "Close" button wired straight to
// its `onClose` prop, so this exercises `CategoriesPage`'s own state
// transitions directly, with no dialog animation timing involved.

vi.mock('@/lib/api', () => ({
  categories: {
    list: vi.fn()
  }
}));

vi.mock('@/components/categories', () => ({
  CategoryFormDialog: ({ open, onClose, category }) => (
    <div data-testid="category-form-dialog-stub">
      <span data-testid="open">{String(open)}</span>
      <span data-testid="category-name">{category?.name ?? 'none'}</span>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
  // A plain "Edit" button in place of the real grid, so this test calls
  // `onEdit` directly rather than through any card markup.
  CategoryList: ({ categories, onEdit }) => (
    <button type="button" onClick={() => onEdit(categories[0])}>
      Edit first category
    </button>
  ),
  CategoryListSkeleton: () => null
}));

const CATEGORY = { id: 3, name: 'Electronics', color: '#3B82F6' };

beforeEach(() => {
  useCategoriesStore.setState(initialCategoriesState);
  vi.clearAllMocks();
  categoriesApi.list.mockResolvedValue([CATEGORY]);
});

describe('CategoriesPage edit dialog state', () => {
  it('keeps the category as "edit" while closing, only resetting to "add" on the next Add', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesPage />);

    await user.click(await screen.findByText('Edit first category'));

    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(screen.getByTestId('category-name')).toHaveTextContent(
      'Electronics'
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Still the same category: only `open` flipped. A dialog that is still
    // mounted while it plays its close animation must not show "add" copy
    // for what was an edit a moment ago.
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(screen.getByTestId('category-name')).toHaveTextContent(
      'Electronics'
    );

    await user.click(screen.getByRole('button', { name: 'Add category' }));

    // Only a fresh "Add" resets it.
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(screen.getByTestId('category-name')).toHaveTextContent('none');
  });
});

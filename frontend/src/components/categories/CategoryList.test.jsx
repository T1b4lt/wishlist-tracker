import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { CategoryList } from './CategoryList';

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

const IN_USE = {
  id: 1,
  name: 'Electronics',
  color: '#3B82F6',
  product_count: 3
};
const UNUSED = { id: 2, name: 'Books', color: '#22C55E', product_count: 0 };

describe('CategoryList', () => {
  it('renders each category with its color, name and pluralized product count', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <CategoryList
        categories={[IN_USE, UNUSED]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(screen.getByText('3 products')).toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('0 products')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('disables delete (without blocking clicks/focus) when the category still has products', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    renderWithProviders(
      <CategoryList
        categories={[IN_USE]}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />
    );

    const deleteButton = screen.getByRole('button', {
      name: 'Delete category Electronics'
    });
    expect(deleteButton).toHaveAttribute('aria-disabled', 'true');

    await user.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows the reason tooltip once the disabled delete button is reached by keyboard', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <CategoryList categories={[IN_USE]} onEdit={vi.fn()} onDelete={vi.fn()} />
    );

    const deleteButton = screen.getByRole('button', {
      name: 'Delete category Electronics'
    });

    // Tab (real keyboard focus, unlike `.focus()`) onto the delete button:
    // the tooltip must be keyboard-reachable, not just hover-triggered.
    await user.tab(); // edit button
    await user.tab(); // delete button
    expect(deleteButton).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Used by 3 products'
    );
  });

  it('enables delete (no tooltip) and calls onDelete when the category has no products', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    renderWithProviders(
      <CategoryList
        categories={[UNUSED]}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />
    );

    const deleteButton = screen.getByRole('button', {
      name: 'Delete category Books'
    });
    expect(deleteButton).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith(UNUSED);
  });

  it('calls onEdit with the clicked category', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    renderWithProviders(
      <CategoryList categories={[UNUSED]} onEdit={onEdit} onDelete={vi.fn()} />
    );

    await user.click(
      screen.getByRole('button', { name: 'Edit category Books' })
    );
    expect(onEdit).toHaveBeenCalledWith(UNUSED);
  });
});

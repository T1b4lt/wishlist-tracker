import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { CategoryFormDialog } from './CategoryFormDialog';

const CATEGORY = { id: 3, name: 'Kitchen', color: '#22C55E' };

describe('CategoryFormDialog', () => {
  it('shows create copy and an empty form when adding a category', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <CategoryFormDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        category={null}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Create New Category' })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Category Name' })).toHaveValue(
      ''
    );
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('pre-fills the form with the category being edited, including the live preview', () => {
    renderWithProviders(
      <CategoryFormDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        category={CATEGORY}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Edit Category' })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Category Name' })).toHaveValue(
      'Kitchen'
    );
    // The live preview tag shows the current name.
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
  });

  it('shows an inline error and does not save when the name is blank', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderWithProviders(
      <CategoryFormDialog
        open
        onClose={vi.fn()}
        onSave={onSave}
        category={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    expect(screen.getByText('Enter a category name.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the trimmed name and selected color, then closes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    renderWithProviders(
      <CategoryFormDialog
        open
        onClose={onClose}
        onSave={onSave}
        category={null}
      />
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Category Name' }),
      '  Furniture  '
    );
    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Furniture' })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps the dialog open when onSave rejects', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    // `onSave` rejecting is expected to log via `console.error`; this just
    // silences it so the test output stays clean.
    spyOnConsoleError();

    renderWithProviders(
      <CategoryFormDialog
        open
        onClose={onClose}
        onSave={onSave}
        category={null}
      />
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Category Name' }),
      'Furniture'
    );
    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Category Name' })).toHaveValue(
      'Furniture'
    );
  });
});

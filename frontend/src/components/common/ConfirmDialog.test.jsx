import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders the title, body and confirm label when open', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete category"
        body="Are you sure?"
        confirmLabel="Delete"
      />
    );

    expect(screen.getByText('Delete category')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    renderWithProviders(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Delete category"
        body="Are you sure?"
        confirmLabel="Delete"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose exactly once when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Delete category"
        body="Are you sure?"
        confirmLabel="Delete"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose exactly once when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Delete category"
        body="Are you sure?"
        confirmLabel="Delete"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose exactly once when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Delete category"
        body="Are you sure?"
        confirmLabel="Delete"
      />
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render dialog content when closed', () => {
    renderWithProviders(
      <ConfirmDialog
        open={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete category"
        body="Are you sure?"
        confirmLabel="Delete"
      />
    );

    expect(screen.queryByText('Delete category')).not.toBeInTheDocument();
  });
});

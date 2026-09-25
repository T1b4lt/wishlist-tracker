import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SaveBar } from './SaveBar';

describe('SaveBar', () => {
  it('is hidden when the form is clean', () => {
    renderWithProviders(
      <SaveBar isDirty={false} onSave={vi.fn()} onDiscard={vi.fn()} />
    );

    expect(
      screen.queryByText('You have unsaved changes')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });

  it('is shown when the form is dirty', () => {
    renderWithProviders(
      <SaveBar isDirty onSave={vi.fn()} onDiscard={vi.fn()} />
    );

    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('calls onSave and onDiscard', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <SaveBar isDirty onSave={onSave} onDiscard={onDiscard} />
    );

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while saving', () => {
    renderWithProviders(
      <SaveBar isDirty isSaving onSave={vi.fn()} onDiscard={vi.fn()} />
    );

    // The Save button's text is visually replaced by a spinner while
    // loading (dropping it from the accessible-name computation), so both
    // buttons are asserted on together by role instead of by name.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => expect(button).toBeDisabled());
  });
});

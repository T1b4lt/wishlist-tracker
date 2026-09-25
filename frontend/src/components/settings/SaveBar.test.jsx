import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { Provider } from '@/components/ui/provider';
import i18n from '@/i18n/index.js';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SaveBar } from './SaveBar';

/** Same wrapping as `renderWithProviders`, for `rerender` calls (which
 * replace the whole tree `render` was given, so it has to be reapplied). */
const wrap = (ui) => (
  <Provider>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </Provider>
);

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
    // The persistent `aria-live` region is still there (see below), just
    // empty while clean.
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('is shown when the form is dirty', () => {
    renderWithProviders(
      <SaveBar isDirty onSave={vi.fn()} onDiscard={vi.fn()} />
    );

    // Once in the visible bar and once in the persistent `role="status"`
    // live region that announces it (see below).
    expect(screen.getAllByText('You have unsaved changes')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('keeps the aria-live region mounted across isDirty changes, so its announcements are reliable', () => {
    const { rerender } = renderWithProviders(
      <SaveBar isDirty={false} onSave={vi.fn()} onDiscard={vi.fn()} />
    );

    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveTextContent('');

    rerender(wrap(<SaveBar isDirty onSave={vi.fn()} onDiscard={vi.fn()} />));

    // Same node (not unmounted and remounted): a live region has to already
    // be present when its content changes for assistive tech to announce
    // that change.
    expect(screen.getByRole('status')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent('You have unsaved changes');

    rerender(
      wrap(<SaveBar isDirty={false} onSave={vi.fn()} onDiscard={vi.fn()} />)
    );

    expect(screen.getByRole('status')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent('');
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

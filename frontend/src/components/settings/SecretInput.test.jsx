import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { toaster } from '@/components/ui/toaster';
import { SecretInput } from './SecretInput';

vi.mock('@/components/ui/toaster', () => ({
  toaster: { create: vi.fn() }
}));

/**
 * Replaces `navigator.clipboard` with a stub whose `writeText` is `impl`.
 * Must run *after* `userEvent.setup()`, which installs its own clipboard
 * stub on `navigator` and would otherwise overwrite this one.
 * @param {(text: string) => Promise<void>} impl
 */
function stubClipboard(impl) {
  const writeText = vi.fn(impl);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true
  });
  return writeText;
}

describe('SecretInput', () => {
  it('shows a "Configured" badge when the draft matches a saved, non-empty value', () => {
    renderWithProviders(
      <SecretInput
        label="Google AI Studio API key"
        value="saved-key"
        savedValue="saved-key"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Configured')).toBeInTheDocument();
  });

  it('hides the badge once the value diverges from what is saved', () => {
    renderWithProviders(
      <SecretInput
        label="Google AI Studio API key"
        value="saved-key-edited"
        savedValue="saved-key"
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Configured')).not.toBeInTheDocument();
  });

  it('hides the badge when there is nothing saved yet, even if the draft is empty', () => {
    renderWithProviders(
      <SecretInput
        label="Google AI Studio API key"
        value=""
        savedValue=""
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Configured')).not.toBeInTheDocument();
  });

  it('masks the value by default and reveals it on toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SecretInput
        label="Telegram bot token"
        value="123:abc"
        savedValue="123:abc"
        onChange={vi.fn()}
      />
    );

    const input = screen.getByDisplayValue('123:abc');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByRole('button', { name: 'Show Telegram bot token' })
    );
    expect(input).toHaveAttribute('type', 'text');

    await user.click(
      screen.getByRole('button', { name: 'Hide Telegram bot token' })
    );
    expect(input).toHaveAttribute('type', 'password');
  });

  it('calls onChange as the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <SecretInput
        label="Telegram bot token"
        value=""
        savedValue=""
        onChange={onChange}
      />
    );

    await user.type(screen.getByLabelText('Telegram bot token'), 'x');

    expect(onChange).toHaveBeenCalled();
  });

  describe('copy to clipboard', () => {
    beforeEach(() => {
      vi.mocked(toaster.create).mockClear();
    });

    it('copies the value and confirms it with a success toast', async () => {
      const user = userEvent.setup();
      const writeText = stubClipboard(() => Promise.resolve());
      renderWithProviders(
        <SecretInput
          label="Telegram bot token"
          value="123:abc"
          savedValue="123:abc"
          onChange={vi.fn()}
        />
      );

      await user.click(
        screen.getByRole('button', { name: 'Copy Telegram bot token' })
      );

      expect(writeText).toHaveBeenCalledWith('123:abc');
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Copied to clipboard',
          description: 'Telegram bot token is on your clipboard.'
        })
      );
    });

    it('shows an error toast when the clipboard write is rejected', async () => {
      const user = userEvent.setup();
      stubClipboard(() => Promise.reject(new Error('denied')));
      renderWithProviders(
        <SecretInput
          label="Telegram bot token"
          value="123:abc"
          savedValue=""
          onChange={vi.fn()}
        />
      );

      await user.click(
        screen.getByRole('button', { name: 'Copy Telegram bot token' })
      );

      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: "Couldn't copy" })
      );
    });

    it('disables the copy button while the field is empty', () => {
      renderWithProviders(
        <SecretInput
          label="Telegram bot token"
          value=""
          savedValue=""
          onChange={vi.fn()}
        />
      );

      expect(
        screen.getByRole('button', { name: 'Copy Telegram bot token' })
      ).toBeDisabled();
    });
  });
});

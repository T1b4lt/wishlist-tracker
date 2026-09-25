import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SecretInput } from './SecretInput';

describe('SecretInput', () => {
  it('shows a "Configured" badge when the draft matches a saved, non-empty value', () => {
    renderWithProviders(
      <SecretInput
        label="Google AI Studio API Key"
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
        label="Google AI Studio API Key"
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
        label="Google AI Studio API Key"
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
        label="Telegram Bot Token"
        value="123:abc"
        savedValue="123:abc"
        onChange={vi.fn()}
      />
    );

    const input = screen.getByDisplayValue('123:abc');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByRole('button', { name: 'Show Telegram Bot Token' })
    );
    expect(input).toHaveAttribute('type', 'text');

    await user.click(
      screen.getByRole('button', { name: 'Hide Telegram Bot Token' })
    );
    expect(input).toHaveAttribute('type', 'password');
  });

  it('calls onChange as the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <SecretInput
        label="Telegram Bot Token"
        value=""
        savedValue=""
        onChange={onChange}
      />
    );

    await user.type(screen.getByLabelText('Telegram Bot Token'), 'x');

    expect(onChange).toHaveBeenCalled();
  });
});

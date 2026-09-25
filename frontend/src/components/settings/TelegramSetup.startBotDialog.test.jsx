import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { telegram as telegramApi } from '@/lib/api';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import { TelegramSetup } from './TelegramSetup';

// Kept in its own file: this is the only test that opens the "start bot"
// `Dialog`, per the one-Ark-dismissable-layer-open/close-cycle-per-file
// convention (see `ProductPage.edit.test.jsx`). Every other `TelegramSetup`
// flow lives in `TelegramSetup.test.jsx`, which never opens a dialog.

vi.mock('@/lib/api', () => ({
  telegram: {
    getChatId: vi.fn(),
    sendTestMessage: vi.fn()
  },
  config: {
    get: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('@/components/ui/toaster', () => ({
  toaster: { create: vi.fn() }
}));

beforeEach(() => {
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
  useConfigStore.setState({
    status: 'success',
    error: null,
    config: {
      selected_language: 'english',
      analysis_hour: 12,
      hist_window_size: 60,
      google_api_key: null,
      telegram_bot_token: 'saved-token',
      telegram_bot_chat_id: null,
      is_price_drop_alert: false,
      is_stock_change_alert: false,
      telegram_status: 'token_only'
    }
  });
});

describe('TelegramSetup start-bot dialog', () => {
  it('shows the start-the-bot instructions when getting the chat id 404s, and closes on "Got it"', async () => {
    const user = userEvent.setup();
    const notFound = new Error('not found');
    notFound.status = 404;
    telegramApi.getChatId.mockRejectedValue(notFound);

    renderWithProviders(
      <TelegramSetup
        tokenValue="saved-token"
        onTokenChange={vi.fn()}
        savedToken="saved-token"
        isTokenDirty={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Get Chat ID' }));

    expect(
      await screen.findByRole('heading', { name: 'Start your Telegram bot' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('1. Open Telegram and search for your bot')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Start your Telegram bot' })
      ).not.toBeInTheDocument()
    );
  });
});

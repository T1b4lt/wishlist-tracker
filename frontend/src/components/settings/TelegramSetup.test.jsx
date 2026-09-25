import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { Provider } from '@/components/ui/provider';
import i18n from '@/i18n/index.js';
import { renderWithProviders } from '@/test/renderWithProviders';
import { telegram as telegramApi, config as configApi } from '@/lib/api';
import { toaster } from '@/components/ui/toaster';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import { TelegramSetup } from './TelegramSetup';

/** Same wrapping as `renderWithProviders`, for `rerender` calls (which
 * replace the whole tree `render` was given, so it has to be reapplied). */
const wrap = (ui) => (
  <Provider>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </Provider>
);

// No `ConfirmDialog`/`Select`/`Menu` open/close cycle happens in any test
// in this file: the 404 "start bot" dialog gets its own file
// (`TelegramSetup.startBotDialog.test.jsx`), per the one-Ark-overlay-per-file
// convention (see `ProductPage.edit.test.jsx`).

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

const CONFIG = {
  selected_language: 'english',
  analysis_hour: 12,
  hist_window_size: 60,
  google_api_key: null,
  telegram_bot_token: 'saved-token',
  telegram_bot_chat_id: null,
  is_price_drop_alert: false,
  is_stock_change_alert: false,
  telegram_status: 'token_only'
};

const setConfig = (overrides = {}) => {
  useConfigStore.setState({
    status: 'success',
    error: null,
    config: { ...CONFIG, ...overrides }
  });
};

const renderTelegramSetup = (props = {}) =>
  renderWithProviders(
    <TelegramSetup
      tokenValue="saved-token"
      onTokenChange={vi.fn()}
      savedToken="saved-token"
      isTokenDirty={false}
      {...props}
    />
  );

beforeEach(() => {
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
});

describe('TelegramSetup', () => {
  it('shows the status badge for each telegram_status', async () => {
    setConfig({ telegram_status: 'not_configured' });
    const { rerender } = renderTelegramSetup();
    expect(await screen.findByText('Not configured')).toBeInTheDocument();

    // The badge cross-fades between statuses (old fades out, then the new
    // one fades in), so the new label only appears asynchronously.
    setConfig({ telegram_status: 'token_only' });
    rerender(
      wrap(
        <TelegramSetup
          tokenValue="saved-token"
          onTokenChange={vi.fn()}
          savedToken="saved-token"
          isTokenDirty={false}
        />
      )
    );
    expect(await screen.findByText('Waiting for chat')).toBeInTheDocument();

    setConfig({ telegram_status: 'connected', telegram_bot_chat_id: '42' });
    rerender(
      wrap(
        <TelegramSetup
          tokenValue="saved-token"
          onTokenChange={vi.fn()}
          savedToken="saved-token"
          isTokenDirty={false}
        />
      )
    );
    expect(await screen.findByText('Connected')).toBeInTheDocument();
  });

  it('disables "Get Chat ID" when no token is saved yet', () => {
    setConfig({ telegram_status: 'not_configured' });
    renderTelegramSetup();

    expect(screen.getByRole('button', { name: 'Get Chat ID' })).toBeDisabled();
    expect(
      screen.getByText('Save your bot token first to continue')
    ).toBeInTheDocument();
  });

  it('disables "Get Chat ID" while the token field has unsaved edits, even if a token was previously saved', () => {
    setConfig({ telegram_status: 'token_only' });
    renderTelegramSetup({ isTokenDirty: true });

    expect(screen.getByRole('button', { name: 'Get Chat ID' })).toBeDisabled();
  });

  it('disables "Test Bot" unless connected, and shows the reason', () => {
    setConfig({ telegram_status: 'token_only' });
    renderTelegramSetup();

    expect(screen.getByRole('button', { name: 'Test Bot' })).toBeDisabled();
    expect(
      screen.getByText('Finish linking your chat first')
    ).toBeInTheDocument();
  });

  it('enables both actions once connected', () => {
    setConfig({ telegram_status: 'connected', telegram_bot_chat_id: '42' });
    renderTelegramSetup();

    expect(
      screen.getByRole('button', { name: 'Get Chat ID' })
    ).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test Bot' })).not.toBeDisabled();
  });

  it('getting the chat id refreshes the config and toasts success', async () => {
    const user = userEvent.setup();
    setConfig({ telegram_status: 'token_only' });
    telegramApi.getChatId.mockResolvedValue({});
    configApi.get.mockResolvedValue({
      ...CONFIG,
      telegram_status: 'connected',
      telegram_bot_chat_id: '999'
    });

    renderTelegramSetup();

    await user.click(screen.getByRole('button', { name: 'Get Chat ID' }));

    expect(telegramApi.getChatId).toHaveBeenCalledTimes(1);
    expect(await screen.findByDisplayValue('999')).toBeInTheDocument();
    expect(toaster.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
  });

  it('shows a translated error when getting the chat id fails, never the raw backend message', async () => {
    const user = userEvent.setup();
    setConfig({ telegram_status: 'token_only' });
    const rawError = new Error('super secret internal stack trace');
    rawError.status = 500;
    telegramApi.getChatId.mockRejectedValue(rawError);

    renderTelegramSetup();

    await user.click(screen.getByRole('button', { name: 'Get Chat ID' }));

    await vi.waitFor(() => expect(toaster.create).toHaveBeenCalled());
    const call = toaster.create.mock.calls[0][0];
    expect(call.type).toBe('error');
    expect(call.description).not.toContain('super secret internal stack trace');
    expect(call.description).toBe(
      'Failed to retrieve chat ID. Please try again.'
    );
  });

  it('shows the "bot token missing" toast on a 400, without opening the start-bot dialog', async () => {
    const user = userEvent.setup();
    setConfig({ telegram_status: 'token_only' });
    const error = new Error('bad request');
    error.status = 400;
    telegramApi.getChatId.mockRejectedValue(error);

    renderTelegramSetup();

    await user.click(screen.getByRole('button', { name: 'Get Chat ID' }));

    await vi.waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Bot token not configured' })
      )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends a test message and toasts success', async () => {
    const user = userEvent.setup();
    setConfig({ telegram_status: 'connected', telegram_bot_chat_id: '42' });
    telegramApi.sendTestMessage.mockResolvedValue({});

    renderTelegramSetup();

    await user.click(screen.getByRole('button', { name: 'Test Bot' }));

    expect(telegramApi.sendTestMessage).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    );
  });

  it('shows a translated error when sending the test message fails, never the raw backend message', async () => {
    const user = userEvent.setup();
    setConfig({ telegram_status: 'connected', telegram_bot_chat_id: '42' });
    const rawError = new Error('leaked backend detail');
    telegramApi.sendTestMessage.mockRejectedValue(rawError);

    renderTelegramSetup();

    await user.click(screen.getByRole('button', { name: 'Test Bot' }));

    await vi.waitFor(() => expect(toaster.create).toHaveBeenCalled());
    const call = toaster.create.mock.calls[0][0];
    expect(call.type).toBe('error');
    expect(call.description).not.toContain('leaked backend detail');
  });
});

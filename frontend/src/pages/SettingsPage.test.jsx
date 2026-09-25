import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { config as configApi, telegram as telegramApi } from '@/lib/api';
import { toaster } from '@/components/ui/toaster';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import SettingsPage from './SettingsPage';

// No `Select`/`Menu`/`Dialog` is opened anywhere in this file: the language
// `Select` gets its own file (`SettingsPage.language.test.jsx`) and the
// leave-guard `ConfirmDialog` gets its own too
// (`SettingsPage.leaveGuard.test.jsx`), per the one-Ark-dismissable-layer
// open/close-cycle-per-file convention (see `ProductPage.edit.test.jsx`).

vi.mock('@/lib/api', () => ({
  config: {
    get: vi.fn(),
    update: vi.fn()
  },
  telegram: {
    getChatId: vi.fn(),
    sendTestMessage: vi.fn()
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

const renderSettingsPage = () => {
  const { hook } = memoryLocation({ path: '/settings' });
  return renderWithProviders(
    <Router hook={hook}>
      <SettingsPage />
    </Router>
  );
};

beforeEach(() => {
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
});

describe('SettingsPage', () => {
  it('shows a loading state, then the three sections once config loads, with no console errors', async () => {
    const getUnexpectedErrors = spyOnConsoleError();
    configApi.get.mockResolvedValue(CONFIG);

    renderSettingsPage();

    expect(
      await screen.findByRole('heading', { name: 'General' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Analysis' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Notifications' })
    ).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('shows an error state with a retry action when the initial load fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    configApi.get.mockRejectedValue(new Error('network down'));

    renderSettingsPage();

    expect(
      await screen.findByText('Error loading settings')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('hides the save bar when clean and shows it once a field is edited', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    renderSettingsPage();

    await screen.findByRole('heading', { name: 'General' });
    expect(
      screen.queryByText('You have unsaved changes')
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Google AI Studio API Key'),
      'a-new-key'
    );

    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();
  });

  it('discards edits back to the saved configuration', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    renderSettingsPage();

    const apiKeyInput = await screen.findByLabelText(
      'Google AI Studio API Key'
    );
    await user.type(apiKeyInput, 'a-new-key');
    expect(apiKeyInput).toHaveValue('a-new-key');

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(apiKeyInput).toHaveValue('');
    await waitFor(() =>
      expect(
        screen.queryByText('You have unsaved changes')
      ).not.toBeInTheDocument()
    );
  });

  it('saves the patch built from the draft and toasts success', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    configApi.update.mockResolvedValue({
      ...CONFIG,
      google_api_key: 'new-key'
    });
    renderSettingsPage();

    await user.type(
      await screen.findByLabelText('Google AI Studio API Key'),
      'new-key'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(configApi.update).toHaveBeenCalledTimes(1));
    expect(configApi.update).toHaveBeenCalledWith(
      expect.objectContaining({ google_api_key: 'new-key' })
    );
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    );
    await waitFor(() =>
      expect(
        screen.queryByText('You have unsaved changes')
      ).not.toBeInTheDocument()
    );
  });

  it('keeps an edit made to the same field during an in-flight save, leaving it dirty', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    // A deferred promise: `configApi.update` is called (the save is "in
    // flight") but does not resolve until `resolveUpdate` is called below,
    // simulating the user continuing to edit while the request is pending.
    let resolveUpdate;
    configApi.update.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );
    renderSettingsPage();

    const apiKeyInput = await screen.findByPlaceholderText(
      'Enter your Google AI Studio API key'
    );
    await user.type(apiKeyInput, 'first-value');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(configApi.update).toHaveBeenCalledWith(
      expect.objectContaining({ google_api_key: 'first-value' })
    );

    // Inputs stay interactive while saving (only Save/Discard are
    // disabled): keep editing the very field that was just sent.
    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, 'second-value');

    // The save resolves with what was actually sent ("first-value").
    resolveUpdate({ ...CONFIG, google_api_key: 'first-value' });

    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    );

    // The in-flight edit survives instead of being reverted to what the
    // now-resolved save sent, and the form is correctly still dirty.
    expect(apiKeyInput).toHaveValue('second-value');
    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();
  });

  it('keeps an edit made to a different field during an in-flight save, leaving only that field dirty', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue({
      ...CONFIG,
      telegram_bot_token: null,
      telegram_status: 'not_configured'
    });
    let resolveUpdate;
    configApi.update.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );
    renderSettingsPage();

    const apiKeyInput = await screen.findByPlaceholderText(
      'Enter your Google AI Studio API key'
    );
    await user.type(apiKeyInput, 'new-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(configApi.update).toHaveBeenCalledWith(
      expect.objectContaining({ google_api_key: 'new-key' })
    );

    // Edit an unrelated field while the save above is still in flight.
    const tokenInput = screen.getByPlaceholderText(
      'Enter your Telegram bot token'
    );
    await user.type(tokenInput, 'mid-edit-token');

    resolveUpdate({
      ...CONFIG,
      google_api_key: 'new-key',
      telegram_bot_token: null,
      telegram_status: 'not_configured'
    });

    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    );

    // The field the save actually settled ends clean...
    expect(apiKeyInput).toHaveValue('new-key');
    // ...while the field edited mid-save keeps that in-progress edit,
    // leaving the form dirty because of it alone.
    expect(tokenInput).toHaveValue('mid-edit-token');
    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();
  });

  it('clears a previously saved secret by sending an empty string, and ends clean', async () => {
    const user = userEvent.setup();
    // No Telegram token here, so there is exactly one "Configured" badge
    // (the Google API key's) to assert on.
    configApi.get.mockResolvedValue({
      ...CONFIG,
      google_api_key: 'existing-key',
      telegram_bot_token: null,
      telegram_status: 'not_configured'
    });
    configApi.update.mockResolvedValue({
      ...CONFIG,
      google_api_key: null,
      telegram_bot_token: null,
      telegram_status: 'not_configured'
    });
    renderSettingsPage();

    // By placeholder, not label text: the field's label also contains the
    // "Configured" badge while the saved secret is untouched, and the
    // reveal button's own `aria-label` ("Show Google AI Studio API Key")
    // would otherwise ambiguously match a label-text query too.
    const apiKeyInput = await screen.findByPlaceholderText(
      'Enter your Google AI Studio API key'
    );
    expect(apiKeyInput).toHaveValue('existing-key');
    expect(screen.getByText('Configured')).toBeInTheDocument();

    await user.clear(apiKeyInput);
    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(configApi.update).toHaveBeenCalledTimes(1));
    // A JSON `null` here would make the backend leave the old secret in
    // place (see `buildConfigPatch`'s doc comment): the empty field must be
    // sent as a real empty string so it is actually cleared.
    expect(configApi.update).toHaveBeenCalledWith(
      expect.objectContaining({ google_api_key: '' })
    );
    await waitFor(() =>
      expect(
        screen.queryByText('You have unsaved changes')
      ).not.toBeInTheDocument()
    );
    expect(apiKeyInput).toHaveValue('');
    expect(screen.queryByText('Configured')).not.toBeInTheDocument();
  });

  it('refreshing the config after obtaining a Telegram chat id does not discard an unrelated unsaved edit', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    telegramApi.getChatId.mockResolvedValue({});
    renderSettingsPage();

    // Start an unrelated, unsaved edit.
    const apiKeyInput = await screen.findByLabelText(
      'Google AI Studio API Key'
    );
    await user.type(apiKeyInput, 'in-progress-key');
    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();

    // The chat id action refreshes the config in the background.
    configApi.get.mockResolvedValue({
      ...CONFIG,
      telegram_status: 'connected',
      telegram_bot_chat_id: '999'
    });
    await user.click(screen.getByRole('button', { name: 'Get Chat ID' }));

    // The unrelated edit survives, and the form is still (only) dirty
    // because of it, not because of anything the refresh touched.
    expect(await screen.findByDisplayValue('999')).toBeInTheDocument();
    expect(apiKeyInput).toHaveValue('in-progress-key');
    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();
    // The status badge cross-fades to its new label, so it is only
    // guaranteed to have finished updating asynchronously.
    expect(await screen.findByText('Connected')).toBeInTheDocument();
  });
});

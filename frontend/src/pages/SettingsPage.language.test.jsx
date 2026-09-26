import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { config as configApi } from '@/lib/api';
import i18n from '@/i18n/index.js';
import { toaster } from '@/components/ui/toaster';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import SettingsPage from './SettingsPage';

// Kept in its own file: opening the "Language" `Select` here is this file's
// one Ark dismissable-layer open/close cycle (see `SettingsPage.test.jsx`'s
// note and `ProductPage.edit.test.jsx`).

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
  telegram_bot_token: null,
  telegram_bot_chat_id: null,
  is_price_drop_alert: false,
  is_stock_change_alert: false,
  telegram_status: 'not_configured'
};

const renderSettingsPage = () => {
  const { hook } = memoryLocation({ path: '/settings' });
  return renderWithProviders(
    <Router hook={hook}>
      <SettingsPage />
    </Router>
  );
};

beforeEach(async () => {
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
  // Reset the shared i18n instance so a previous test's applied language
  // (from a successful save elsewhere) never leaks into this one.
  await i18n.changeLanguage('english');
});

describe('SettingsPage language', () => {
  it('does not apply the selected language until Save succeeds', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    configApi.update.mockResolvedValue({
      ...CONFIG,
      selected_language: 'spanish'
    });
    renderSettingsPage();

    await screen.findByRole('heading', { name: 'General' });
    expect(i18n.language).toBe('english');

    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    await user.click(await screen.findByRole('option', { name: 'Spanish' }));

    // Selecting a new language only updates the draft: the UI is still in
    // English, and nothing has been sent to the backend yet.
    expect(i18n.language).toBe('english');
    expect(configApi.update).not.toHaveBeenCalled();
    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(configApi.update).toHaveBeenCalledTimes(1));
    expect(configApi.update).toHaveBeenCalledWith(
      expect.objectContaining({ selected_language: 'spanish' })
    );
    await waitFor(() => expect(i18n.language).toBe('spanish'));
  });

  it('shows the save-success toast in the language just saved, not the previous one', async () => {
    // Regression test: `handleSave` used to build this toast with the `t`
    // from `useTranslation()`, a fixed snapshot bound to whichever language
    // was active at the last render (before this save started). Since a
    // save that changes the language applies it *before* resolving (see
    // `configStore.js`'s `save`), by the time this toast is created the
    // language has already moved on, and it must reflect that, not the
    // stale render-time snapshot.
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    configApi.update.mockResolvedValue({
      ...CONFIG,
      selected_language: 'spanish'
    });
    renderSettingsPage();

    await screen.findByRole('heading', { name: 'General' });
    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    await user.click(await screen.findByRole('option', { name: 'Spanish' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(toaster.create).toHaveBeenCalledTimes(1));
    expect(toaster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ajustes guardados',
        description: 'Tus ajustes se han guardado correctamente.',
        type: 'success'
      })
    );
  });
});

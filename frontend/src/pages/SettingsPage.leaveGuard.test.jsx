import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { config as configApi } from '@/lib/api';
import { useConfigStore, initialConfigState } from '@/stores/configStore';
import SettingsPage from './SettingsPage';

// Kept in its own file: confirming the intercepted navigation opens and
// closes the leave-guard `ConfirmDialog`, this file's one Ark
// dismissable-layer cycle (see `SettingsPage.test.jsx`'s note).

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

const LocationProbe = () => {
  const [location] = useLocation();
  return <div data-testid="location">{location}</div>;
};

/** A tiny stand-in for the app shell's own navigation (header nav, a
 * dashboard link, ...): a real `wouter` `Link` elsewhere in the document,
 * which the guard's document-level click listener intercepts regardless of
 * where it renders. */
const renderSettingsPage = () => {
  const { hook } = memoryLocation({ path: '/settings' });
  return renderWithProviders(
    <Router hook={hook}>
      <LocationProbe />
      <Link href="/">Wishlist</Link>
      <Switch>
        <Route path="/settings" component={SettingsPage} />
        <Route path="/" component={() => <div>Dashboard page</div>} />
      </Switch>
    </Router>
  );
};

beforeEach(() => {
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
});

describe('SettingsPage leave guard', () => {
  it('confirms before leaving with unsaved changes, then navigates away', async () => {
    const user = userEvent.setup();
    configApi.get.mockResolvedValue(CONFIG);
    renderSettingsPage();

    await user.type(
      await screen.findByLabelText('Google AI Studio API key'),
      'a-new-key'
    );
    expect(
      screen.getAllByText('You have unsaved changes')[0]
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Wishlist' }));

    // Still on the Settings page: the click was intercepted.
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
    expect(
      await screen.findByText(
        'You have unsaved changes that will be lost if you leave this page.'
      )
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Leave without saving' })
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/')
    );
  });
});

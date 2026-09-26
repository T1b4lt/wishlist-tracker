import { screen, waitFor } from '@testing-library/react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { config as configApi } from '@/lib/api';
import { initialConfigState, useConfigStore } from '@/stores/configStore';
import i18n from '@/i18n';
import AppShell from './AppShell';

vi.mock('@/lib/api', () => ({
  config: { get: vi.fn(), update: vi.fn() }
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

beforeEach(() => {
  useConfigStore.setState(initialConfigState);
  vi.mocked(configApi.get).mockReset().mockResolvedValue(CONFIG);
  // jsdom does not implement `window.scrollTo`.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', '/');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.changeLanguage('english');
});

// Reduced motion keeps the exit/enter transition duration at 0, so the
// route change settles without waiting on a real animation.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

const HomePage = () => <div>Home page content</div>;
const AboutPage = () => <div>About page content</div>;

/**
 * Mirrors how `App.jsx` wires `AppShell`: `useLocation()` is read here and
 * passed explicitly to `Switch`, so `AppShell` (which reads its own
 * `useLocation()` to key the transition) and `Switch` always agree on which
 * route is rendering.
 */
const Harness = () => {
  const [location] = useLocation();
  return (
    <AppShell>
      <Switch location={location}>
        <Route path="/" component={HomePage} />
        <Route path="/about" component={AboutPage} />
      </Switch>
    </AppShell>
  );
};

describe('AppShell route transitions', () => {
  it('renders the matched route and swaps to the next one on navigation without blanking or double-rendering', async () => {
    const { hook, navigate } = memoryLocation({ path: '/' });

    renderWithProviders(
      <Router hook={hook}>
        <Harness />
      </Router>
    );

    expect(screen.getByText('Home page content')).toBeInTheDocument();
    expect(screen.queryByText('About page content')).not.toBeInTheDocument();

    navigate('/about');

    await waitFor(() => {
      expect(screen.getByText('About page content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Home page content')).not.toBeInTheDocument();
  });

  it('scrolls back to the top once the previous page has animated out', async () => {
    const { hook, navigate } = memoryLocation({ path: '/' });

    renderWithProviders(
      <Router hook={hook}>
        <Harness />
      </Router>
    );
    expect(window.scrollTo).not.toHaveBeenCalled();

    navigate('/about');

    await screen.findByText('About page content');
    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'instant'
      })
    );
  });

  it('leaves the scroll position alone when the destination has a #hash anchor', async () => {
    const { hook, navigate } = memoryLocation({ path: '/' });

    renderWithProviders(
      <Router hook={hook}>
        <Harness />
      </Router>
    );

    window.history.replaceState(null, '', '/about#details');
    navigate('/about');

    await screen.findByText('About page content');
    // Give the exit a chance to complete before asserting the negative.
    await waitFor(() =>
      expect(screen.queryByText('Home page content')).not.toBeInTheDocument()
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('leaves the scroll position alone on browser back/forward navigation', async () => {
    const { hook, navigate } = memoryLocation({ path: '/' });

    renderWithProviders(
      <Router hook={hook}>
        <Harness />
      </Router>
    );

    window.history.replaceState(null, '', '/about');
    window.dispatchEvent(new PopStateEvent('popstate'));
    navigate('/about');

    await screen.findByText('About page content');
    await waitFor(() =>
      expect(screen.queryByText('Home page content')).not.toBeInTheDocument()
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('loads the config at startup and applies its saved language, whatever the page', async () => {
    configApi.get.mockResolvedValue({
      ...CONFIG,
      selected_language: 'spanish'
    });
    const { hook } = memoryLocation({ path: '/about' });

    renderWithProviders(
      <Router hook={hook}>
        <Harness />
      </Router>
    );

    await waitFor(() => expect(i18n.language).toBe('spanish'));
    expect(configApi.get).toHaveBeenCalledTimes(1);
  });
});

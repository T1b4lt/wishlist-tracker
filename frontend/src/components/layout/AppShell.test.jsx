import { screen, waitFor } from '@testing-library/react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import AppShell from './AppShell';

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
});

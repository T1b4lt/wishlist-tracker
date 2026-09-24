import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { ProductTable } from './ProductTable';

// Reduced motion keeps every preset's duration at 0 and skips
// `AnimatePresence`'s exit delay, so assertions do not need to wait on a
// real animation.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

const PRODUCT = {
  id: 42,
  name: 'Mechanical Keyboard',
  category_id: 1,
  category_name: 'Electronics',
  category_color: '#3182ce',
  priority: 'High',
  current_price: 120,
  price_change_60d: -8,
  is_in_stock: true,
  currency: 'EUR',
  recent_prices: [140, 130, 125, 120],
  last_checked_at: 1700000000
};

/** Shows the current location, so a test can assert whether navigation happened. */
const LocationProbe = () => {
  const [location] = useLocation();
  return <div data-testid="location">{location}</div>;
};

const renderTable = (props = {}) => {
  const { hook } = memoryLocation({ path: '/' });
  return renderWithProviders(
    <Router hook={hook}>
      <LocationProbe />
      <ProductTable
        products={[PRODUCT]}
        isLoading={false}
        locale="en-US"
        histWindowSize={60}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </Router>
  );
};

describe('ProductTable', () => {
  it('renders a row per product with no console errors', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderTable();

    expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('navigates to the product detail page when the row is clicked', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByText('Mechanical Keyboard'));

    expect(screen.getByTestId('location')).toHaveTextContent('/product/42');
  });

  it('navigates to the product detail page when the focused row receives Enter', async () => {
    const user = userEvent.setup();
    renderTable();

    screen.getByRole('link', { name: /mechanical keyboard/i }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/product/42');
  });

  // Both menu interactions live in a single test: opening a second Chakra
  // `Menu` in the same test file/module, after an earlier test already
  // opened and closed one, is flaky in jsdom (Ark UI's outside-click
  // tracking races a real macrotask against the next test's render/click).
  // See the (deleted) exploratory spike for the full diagnosis; the fix
  // that stuck is keeping every real menu open+select interaction inside
  // one test.
  it('does not navigate when the row actions menu is used, and calls the matching callback for the clicked item', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderTable({ onEdit });

    await user.click(
      screen.getByRole('button', { name: /actions for mechanical keyboard/i })
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    await user.click(screen.getByRole('menuitem', { name: /edit/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    expect(onEdit).toHaveBeenCalledWith(PRODUCT);
  });

  it('renders skeleton placeholder rows while loading', () => {
    renderTable({ products: [], isLoading: true });

    expect(screen.queryByText('Mechanical Keyboard')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { hidden: true })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { ProductCardList } from './ProductCardList';

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

const PRODUCT = {
  id: 7,
  name: 'Espresso Machine',
  category_id: 2,
  category_name: 'Kitchen',
  category_color: '#38a169',
  priority: 'Medium',
  current_price: 350,
  price_change_60d: 4,
  is_in_stock: false,
  currency: 'USD',
  recent_prices: [330, 340, 350],
  last_checked_at: 1700000000
};

/** Shows the current location, so a test can assert whether navigation happened. */
const LocationProbe = () => {
  const [location] = useLocation();
  return <div data-testid="location">{location}</div>;
};

const renderCards = (props = {}) => {
  const { hook } = memoryLocation({ path: '/' });
  return renderWithProviders(
    <Router hook={hook}>
      <LocationProbe />
      <ProductCardList
        products={[PRODUCT]}
        isLoading={false}
        locale="en-US"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </Router>
  );
};

describe('ProductCardList', () => {
  it('renders a card per product with no console errors', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderCards();

    expect(screen.getByText('Espresso Machine')).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('navigates to the product detail page when the card is clicked', async () => {
    const user = userEvent.setup();
    renderCards();

    await user.click(screen.getByText('Espresso Machine'));

    expect(screen.getByTestId('location')).toHaveTextContent('/product/7');
  });

  it('navigates to the product detail page when the focused card receives Enter', async () => {
    const user = userEvent.setup();
    renderCards();

    screen.getByRole('link', { name: /espresso machine/i }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/product/7');
  });

  // Kept as the only test in this file that opens the actions menu: see the
  // note in `ProductTable.test.jsx` about menu-in-jsdom test ordering.
  it('does not navigate when the card actions menu is used, and calls the matching callback for the clicked item', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderCards({ onDelete });

    await user.click(
      screen.getByRole('button', { name: /actions for espresso machine/i })
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    await user.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    expect(onDelete).toHaveBeenCalledWith(PRODUCT);
  });

  it('renders skeleton placeholder cards while loading', () => {
    renderCards({ products: [], isLoading: true });

    expect(screen.queryByText('Espresso Machine')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});

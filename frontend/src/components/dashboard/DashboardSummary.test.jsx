import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { DashboardSummary } from './DashboardSummary';

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

const product = (overrides = {}) => ({
  current_price: 100,
  currency: 'EUR',
  price_change_60d: 0,
  recent_prices: [100],
  ...overrides
});

describe('DashboardSummary', () => {
  it('renders nothing for an empty product list', () => {
    renderWithProviders(<DashboardSummary products={[]} locale="en-US" />);

    expect(screen.queryByText('Items')).not.toBeInTheDocument();
  });

  it('renders every stat when all are computable, with no console errors', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <DashboardSummary
        products={[
          product({ current_price: 10, currency: 'EUR', price_change_60d: -5 }),
          product({
            current_price: 20,
            currency: 'USD',
            price_change_60d: 3,
            recent_prices: [20, 25]
          })
        ]}
        locale="en-US"
      />
    );

    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Total value')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('Price drops')).toBeInTheDocument();
    expect(screen.getByText('At lowest price')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('hides the price-drops and at-lowest stats when neither is computable', () => {
    renderWithProviders(
      <DashboardSummary
        products={[product({ price_change_60d: null, recent_prices: null })]}
        locale="en-US"
      />
    );

    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.queryByText('Price drops')).not.toBeInTheDocument();
    expect(screen.queryByText('At lowest price')).not.toBeInTheDocument();
  });

  it('hides the total-value stat when no product has a computable price', () => {
    renderWithProviders(
      <DashboardSummary
        products={[product({ current_price: null, currency: null })]}
        locale="en-US"
      />
    );

    expect(screen.queryByText('Total value')).not.toBeInTheDocument();
  });
});

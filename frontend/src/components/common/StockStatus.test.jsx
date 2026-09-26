import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { StockStatus } from './StockStatus';

describe('StockStatus', () => {
  it('renders "In stock" text when in stock', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<StockStatus inStock={true} />);

    expect(screen.getByText('In stock')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders "Out of stock" text when out of stock', () => {
    renderWithProviders(<StockStatus inStock={false} />);

    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });

  it('renders a fallback when stock is not tracked', () => {
    renderWithProviders(<StockStatus inStock={null} />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});

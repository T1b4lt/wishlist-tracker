import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { StockStatus } from './StockStatus';

describe('StockStatus', () => {
  it('renders "In Stock" text when in stock', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<StockStatus inStock={true} />);

    expect(screen.getByText('In Stock')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders "Out of Stock" text when out of stock', () => {
    renderWithProviders(<StockStatus inStock={false} />);

    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
  });

  it('renders a fallback when stock is not tracked', () => {
    renderWithProviders(<StockStatus inStock={null} />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});

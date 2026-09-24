import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { PriceChange } from './PriceChange';

describe('PriceChange', () => {
  it('renders a "-" sign for a negative change', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<PriceChange value={-3.2} locale="en-US" />);

    expect(screen.getByText('-3.2%')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders a "+" sign for a positive change', () => {
    renderWithProviders(<PriceChange value={5} locale="en-US" />);

    expect(screen.getByText('+5.0%')).toBeInTheDocument();
  });

  it('renders no sign for a flat (0) change', () => {
    renderWithProviders(<PriceChange value={0} locale="en-US" />);

    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('renders a fallback when there is no value', () => {
    renderWithProviders(<PriceChange value={null} locale="en-US" />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { ProductStatsRow } from './ProductStatsRow';

describe('ProductStatsRow', () => {
  it('renders the current price, the lowest price with its date, the average and the signed current-vs-average change', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <ProductStatsRow
        currentPrice={90}
        currency="USD"
        locale="en-US"
        lowest={{ price: 80, timestamp: 1700000000 }}
        average={100}
        currentVsAverage={-10}
      />
    );

    expect(screen.getByText('Current price')).toBeInTheDocument();
    expect(screen.getByText('$90.00')).toBeInTheDocument();
    expect(screen.getByText('Lowest in range')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getByText(/^Reached /)).toBeInTheDocument();
    expect(screen.getByText('Average in range')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('Current vs average')).toBeInTheDocument();
    expect(screen.getByText('-10.0%')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders placeholders when there is no range data yet', () => {
    renderWithProviders(
      <ProductStatsRow
        currentPrice={null}
        currency="USD"
        locale="en-US"
        lowest={null}
        average={null}
        currentVsAverage={null}
      />
    );

    // "Current price" and "Average in range" both fall back to a bare
    // dash, and "Current vs average" (via `PriceChange`) falls back to N/A.
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByText(/^Reached /)).not.toBeInTheDocument();
  });
});

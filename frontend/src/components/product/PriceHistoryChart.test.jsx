import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { PriceHistoryChart } from './PriceHistoryChart';

const BASE_PROPS = {
  range: '60',
  onRangeChange: vi.fn(),
  chartPoints: [
    { timestamp: 1, price: 10, isInStock: true, changePercent: null },
    { timestamp: 2, price: 12, isInStock: true, changePercent: 20 }
  ],
  yDomain: [9, 13],
  outOfStockBands: [],
  average: 11,
  lowest: { price: 10, timestamp: 1 },
  hasEnoughHistory: true,
  trackingStartDate: 1,
  currency: 'USD',
  locale: 'en-US'
};

describe('PriceHistoryChart', () => {
  it('renders the title and every range option, with the selected one checked', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<PriceHistoryChart {...BASE_PROPS} />);

    expect(screen.getByText('Price history')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 days' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '60 days' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '90 days' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '180 days' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('calls onRangeChange with the picked option', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();

    renderWithProviders(
      <PriceHistoryChart {...BASE_PROPS} onRangeChange={onRangeChange} />
    );

    await user.click(screen.getByRole('radio', { name: '90 days' }));

    expect(onRangeChange).toHaveBeenCalledWith('90');
  });

  it('shows the "tracking started" message instead of the chart when there is not enough history', () => {
    renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        chartPoints={[]}
        hasEnoughHistory={false}
        average={null}
        lowest={null}
        trackingStartDate={1700000000}
      />
    );

    expect(
      screen.getByText(
        'Tracking started Nov 14, 2023. The chart fills in as prices are checked.'
      )
    ).toBeInTheDocument();
  });

  it('falls back to a dash in the message when no tracking start date is known', () => {
    renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        chartPoints={[]}
        hasEnoughHistory={false}
        average={null}
        lowest={null}
        trackingStartDate={null}
      />
    );

    expect(
      screen.getByText(
        'Tracking started -. The chart fills in as prices are checked.'
      )
    ).toBeInTheDocument();
  });
});

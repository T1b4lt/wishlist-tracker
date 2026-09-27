import { cloneElement } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { buildOfferSeries } from '@/lib/offerChart';
import { RANGE_ALL } from '@/lib/productHistory';
import {
  buildMultiStoreDetail,
  buildProductDetail
} from '../../../e2e/fixtures/products';
import { PriceHistoryChart } from './PriceHistoryChart';

const record = (price, isInStock, timestamp) => ({
  price,
  is_in_stock: isInStock,
  timestamp
});

/** One store's series from `(price, inStock, timestamp)` records. */
const singleSeries = (records) =>
  buildOfferSeries(
    [{ id: 1, store_name: 'Amazon', price_history: records }],
    RANGE_ALL
  );

// jsdom never gives `ResponsiveContainer` a non-zero measured size (there is
// no real layout, and the `ResizeObserver` stub in `src/test/setup.js` never
// invokes its callback), so it would otherwise render nothing at all.
// Mounting its single child (the `LineChart`) directly with an explicit
// pixel size skips that measurement and lets the rest of recharts compute
// real axis scales, so the reference-area/band tests below can assert on
// the actual rendered SVG.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) =>
      cloneElement(children, { width: 600, height: 300 })
  };
});

const BASE_PROPS = {
  range: '60',
  onRangeChange: vi.fn(),
  series: singleSeries([record(10, true, 1), record(12, true, 2)]),
  yDomain: [9, 13],
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
        series={[]}
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

  it('shows a "not enough data in this range" message instead of "tracking started" when a longer range would plot', () => {
    renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        series={[]}
        hasEnoughHistory={false}
        hasEnoughTotalHistory
        average={null}
        lowest={null}
        trackingStartDate={1700000000}
      />
    );

    expect(
      screen.getByText(
        'Not enough data in this range. Pick a longer range to see the chart.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tracking started/)).not.toBeInTheDocument();
  });

  it('falls back to a dash in the message when no tracking start date is known', () => {
    renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        series={[]}
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

  it('draws an out-of-stock stretch as a dashed segment of the same line', () => {
    const { container } = renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        series={singleSeries([
          record(10, true, 1),
          record(12, false, 2),
          record(11, true, 3)
        ])}
      />
    );

    const lines = container.querySelectorAll('.recharts-line-curve');
    expect(lines).toHaveLength(2);
    // In jsdom Recharts' draw animation overwrites `stroke-dasharray` on
    // every line, so the out-of-stock line is told apart by its opacity.
    const outOfStock = [...lines].filter(
      (line) => line.getAttribute('stroke-opacity') === '0.6'
    );
    expect(outOfStock).toHaveLength(1);
  });

  it('shows a legend with every store when there is more than one', () => {
    renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        series={buildOfferSeries(buildMultiStoreDetail().offers, RANGE_ALL)}
      />
    );

    const legend = screen.getByRole('list', { name: 'Stores' });
    expect(within(legend).getByText('Amazon')).toBeInTheDocument();
    expect(within(legend).getByText('Thomann')).toBeInTheDocument();
  });

  it('has no legend for a single store', () => {
    renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        series={buildOfferSeries(buildProductDetail().offers, RANGE_ALL)}
      />
    );

    expect(
      screen.queryByRole('list', { name: 'Stores' })
    ).not.toBeInTheDocument();
  });
});

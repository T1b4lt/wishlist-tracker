import { cloneElement } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { PriceHistoryChart } from './PriceHistoryChart';

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

  it('shows a "not enough data in this range" message instead of "tracking started" when a longer range would plot', () => {
    renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        chartPoints={[]}
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

  it('renders a visible, non-zero-width out-of-stock reference area for a closed run', () => {
    const { container } = renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        chartPoints={[
          { timestamp: 1, price: 10, isInStock: true, changePercent: null },
          { timestamp: 2, price: 12, isInStock: false, changePercent: 20 },
          { timestamp: 3, price: 11, isInStock: true, changePercent: -8.3 }
        ]}
        outOfStockBands={[{ x1: 2, x2: 3 }]}
      />
    );

    const bandRects = container.querySelectorAll(
      '.recharts-reference-area-rect'
    );
    expect(bandRects).toHaveLength(1);
    const width = Number(bandRects[0].getAttribute('width'));
    expect(width).toBeGreaterThan(0);
  });

  it('renders a visible, non-zero-width band for a trailing single-sample out-of-stock run, entirely inside the plotted X range', () => {
    // Shaped exactly like what `computeOutOfStockBands` now returns for a
    // single trailing out-of-stock sample: extended *backward* from the
    // last point (`x2`), never past it, so it stays inside the chart's
    // `['dataMin', 'dataMax']` X domain instead of being clipped.
    const { container } = renderWithProviders(
      <PriceHistoryChart
        {...BASE_PROPS}
        chartPoints={[
          { timestamp: 1, price: 10, isInStock: true, changePercent: null },
          { timestamp: 2, price: 10, isInStock: true, changePercent: 0 },
          { timestamp: 3, price: 10, isInStock: false, changePercent: 0 }
        ]}
        yDomain={[9, 11]}
        outOfStockBands={[{ x1: 2.5, x2: 3 }]}
      />
    );

    const bandRects = container.querySelectorAll(
      '.recharts-reference-area-rect'
    );
    expect(bandRects).toHaveLength(1);

    const rect = bandRects[0];
    const x = Number(rect.getAttribute('x'));
    const width = Number(rect.getAttribute('width'));
    expect(width).toBeGreaterThan(0);

    // "Inside the plot area": the band's right edge must not exceed the
    // chart's own plotted width (i.e. it was not pushed past `dataMax`,
    // which would fall in the margin and be clipped).
    const surface = container.querySelector('.recharts-surface');
    expect(surface).toBeTruthy();
    const chartWidth = Number(surface.getAttribute('width'));
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(chartWidth);
  });
});

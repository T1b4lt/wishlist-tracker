import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { StaleBadge } from './StaleBadge';

const DAY = 86400;
const NOW = 1_800_000_000;

describe('StaleBadge', () => {
  it('shows how many days the price has gone without updates', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<StaleBadge lastCheckedAt={NOW - 4 * DAY} now={NOW} />);

    expect(screen.getByText('No updates for 4 days')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders nothing while the price is up to date', () => {
    renderWithProviders(<StaleBadge lastCheckedAt={NOW - DAY} now={NOW} />);

    expect(screen.queryByText(/No updates/)).not.toBeInTheDocument();
  });

  it('renders nothing for a product that was never checked', () => {
    renderWithProviders(<StaleBadge lastCheckedAt={null} now={NOW} />);

    expect(screen.queryByText(/No updates/)).not.toBeInTheDocument();
  });

  it('names the stale stores in the tooltip', async () => {
    renderWithProviders(
      <StaleBadge
        lastCheckedAt={NOW - 4 * DAY}
        storeNames={['Amazon']}
        now={NOW}
      />
    );

    await userEvent.hover(screen.getByText('No updates for 4 days'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Not updated in: Amazon.'
    );
  });
});

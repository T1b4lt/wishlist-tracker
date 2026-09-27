import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { StaleBadge } from './StaleBadge';

describe('StaleBadge', () => {
  it('shows how many days the price has gone without updates', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<StaleBadge days={4} />);

    expect(screen.getByText('No updates for 4 days')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders nothing without stale days', () => {
    renderWithProviders(<StaleBadge days={null} />);

    expect(screen.queryByText(/No updates/)).not.toBeInTheDocument();
  });

  it('names the stale stores in the tooltip', async () => {
    renderWithProviders(<StaleBadge days={4} storeNames={['Amazon']} />);

    await userEvent.hover(screen.getByText('No updates for 4 days'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Not updated in: Amazon.'
    );
  });
});

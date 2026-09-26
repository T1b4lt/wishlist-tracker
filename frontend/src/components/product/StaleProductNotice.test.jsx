import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { StaleProductNotice } from './StaleProductNotice';

const DAY = 86400;
const NOW = 1_800_000_000;
const URL = 'https://shop.example.com/item';

describe('StaleProductNotice', () => {
  it('explains that the price has not been updated and links to the store page', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <StaleProductNotice
        lastCheckedAt={NOW - 5 * DAY}
        url={URL}
        locale="en-US"
        now={NOW}
      />
    );

    expect(
      screen.getByText('Price not updated for 5 days')
    ).toBeInTheDocument();
    expect(screen.getByText(/the store may be down/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Check the store page/ });
    expect(link).toHaveAttribute('href', URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders nothing while the price is up to date', () => {
    renderWithProviders(
      <StaleProductNotice
        lastCheckedAt={NOW - DAY}
        url={URL}
        locale="en-US"
        now={NOW}
      />
    );

    expect(screen.queryByText(/Price not updated/)).not.toBeInTheDocument();
  });

  it('renders nothing for a product that was never checked', () => {
    renderWithProviders(
      <StaleProductNotice
        lastCheckedAt={null}
        url={URL}
        locale="en-US"
        now={NOW}
      />
    );

    expect(screen.queryByText(/Price not updated/)).not.toBeInTheDocument();
  });
});

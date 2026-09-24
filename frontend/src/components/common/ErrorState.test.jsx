import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders the title and message', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <ErrorState
        title="We could not load your wishlist"
        message="Something went wrong"
      />
    );

    expect(
      screen.getByText('We could not load your wishlist')
    ).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderWithProviders(<ErrorState title="Error" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render a retry button when onRetry is not given', () => {
    renderWithProviders(<ErrorState title="Error" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

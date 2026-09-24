import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('renders a status region with the default loading label', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<LoadingState />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('announces a custom label when given', () => {
    renderWithProviders(<LoadingState label="Loading products" />);

    expect(screen.getByText('Loading products')).toBeInTheDocument();
  });
});

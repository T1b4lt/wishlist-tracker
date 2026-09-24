import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders a chart (aria-hidden) for two or more usable price points', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    const { container } = renderWithProviders(
      <Sparkline values={[10, 9, 8, 8.5]} />
    );

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders "not available" instead of a chart for fewer than two usable points', () => {
    renderWithProviders(<Sparkline values={[10]} />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('renders "not available" for an empty, null or undefined values list', () => {
    const empty = renderWithProviders(<Sparkline values={[]} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
    empty.unmount();

    const nullValues = renderWithProviders(<Sparkline values={null} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
    nullValues.unmount();

    renderWithProviders(<Sparkline values={undefined} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('ignores non-finite values when counting usable points', () => {
    renderWithProviders(<Sparkline values={[10, null, NaN, undefined]} />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});

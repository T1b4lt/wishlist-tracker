import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { PriorityBadge } from './PriorityBadge';

describe('PriorityBadge', () => {
  it('renders the translated label for a known priority', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<PriorityBadge priority="high" />);

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('uses a different font weight per priority', () => {
    renderWithProviders(<PriorityBadge priority="high" />);
    expect(getComputedStyle(screen.getByText('High')).fontWeight).toBe(
      'var(--chakra-font-weights-bold)'
    );

    renderWithProviders(<PriorityBadge priority="low" />);
    expect(getComputedStyle(screen.getByText('Low')).fontWeight).toBe(
      'var(--chakra-font-weights-normal)'
    );
  });

  it('renders nothing when given no priority', () => {
    renderWithProviders(<PriorityBadge priority="" />);
    expect(document.querySelector('.chakra-badge')).not.toBeInTheDocument();
  });
});

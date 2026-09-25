import { screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('renders plain copy with a single link back to the wishlist, no console errors', () => {
    const getUnexpectedErrors = spyOnConsoleError();
    const { hook } = memoryLocation({ path: '/does-not-exist' });

    renderWithProviders(
      <Router hook={hook}>
        <NotFoundPage />
      </Router>
    );

    expect(
      screen.getByRole('heading', { name: 'Page not found' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('This page does not exist or may have been moved.')
    ).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: 'Back to wishlist' });
    expect(backLink).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link')).toHaveLength(1);

    // No emoji, no em/en dash, in the rendered copy.
    expect(document.body.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(document.body.textContent).not.toMatch(/[—–]/);
    expect(getUnexpectedErrors()).toEqual([]);
  });
});

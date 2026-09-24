import { screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import AppHeader from './AppHeader';

describe('AppHeader', () => {
  it('marks the current route as the active nav link with aria-current="page"', () => {
    const { hook } = memoryLocation({ path: '/categories' });

    renderWithProviders(
      <Router hook={hook}>
        <AppHeader />
      </Router>
    );

    const categoriesLinks = screen.getAllByRole('link', {
      name: 'Categories'
    });
    expect(
      categoriesLinks.some(
        (link) => link.getAttribute('aria-current') === 'page'
      )
    ).toBe(true);

    const dashboardLinks = screen.getAllByRole('link', { name: 'Dashboard' });
    dashboardLinks.forEach((link) =>
      expect(link).not.toHaveAttribute('aria-current')
    );
  });

  it('renders the brand name and a theme toggle button', () => {
    const { hook } = memoryLocation({ path: '/' });

    renderWithProviders(
      <Router hook={hook}>
        <AppHeader />
      </Router>
    );

    expect(screen.getByText('Wishlist Tracker')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle color mode' })
    ).toBeInTheDocument();
  });
});

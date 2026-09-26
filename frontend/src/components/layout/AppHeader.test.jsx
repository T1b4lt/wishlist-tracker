import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    const wishlistLinks = screen.getAllByRole('link', { name: 'Wishlist' });
    wishlistLinks.forEach((link) =>
      expect(link).not.toHaveAttribute('aria-current')
    );
  });

  it('renders the brand name as a link home and a theme toggle button', () => {
    const { hook } = memoryLocation({ path: '/' });

    renderWithProviders(
      <Router hook={hook}>
        <AppHeader />
      </Router>
    );

    expect(
      screen.getByRole('link', { name: 'Wishlist Tracker' })
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('button', { name: 'Toggle color mode' })
    ).toBeInTheDocument();
  });

  it('closes the mobile drawer when the location changes without a click on its links', async () => {
    // e.g. a navigation confirmed through `useUnsavedChangesGuard`, which
    // stops the original link click before the link's own `onClick` runs.
    const user = userEvent.setup();
    const { hook, navigate } = memoryLocation({ path: '/settings' });

    renderWithProviders(
      <Router hook={hook}>
        <AppHeader />
      </Router>
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByRole('link', { name: 'Categories' })
    ).toBeInTheDocument();

    act(() => navigate('/categories'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

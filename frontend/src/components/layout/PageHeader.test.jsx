import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import PageHeader from './PageHeader';

describe('PageHeader', () => {
  it('renders the title, description and actions', () => {
    renderWithProviders(
      <PageHeader
        title="Your Wishlist"
        description="Track prices and availability"
        actions={<button type="button">Add New Product</button>}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Your Wishlist' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Track prices and availability')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add New Product' })
    ).toBeInTheDocument();
  });

  it('renders only the title when description and actions are omitted', () => {
    renderWithProviders(<PageHeader title="Settings" />);

    expect(
      screen.getByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a back link when provided', () => {
    renderWithProviders(
      <PageHeader
        title="Product name"
        backLink={{ href: '/', label: 'Back to wishlist' }}
      />
    );

    const backLink = screen.getByRole('link', { name: /back to wishlist/i });
    expect(backLink).toHaveAttribute('href', '/');
  });
});

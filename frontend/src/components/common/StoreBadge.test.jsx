import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { faviconUrl } from '@/lib/api/stores';
import { StoreBadge, StoreFavicon } from './StoreBadge';

describe('StoreFavicon', () => {
  it('renders the favicon as a decorative image', () => {
    const getUnexpectedErrors = spyOnConsoleError();
    const { container } = renderWithProviders(
      <StoreFavicon storeId={7} hasFavicon />
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', faviconUrl(7));
    expect(img).toHaveAttribute('alt', '');
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('shows the fallback icon when the store has no favicon', () => {
    const { container } = renderWithProviders(
      <StoreFavicon storeId={7} hasFavicon={false} />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows the fallback icon when the favicon fails to load', () => {
    const { container } = renderWithProviders(
      <StoreFavicon storeId={7} hasFavicon />
    );

    fireEvent.error(container.querySelector('img'));

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('StoreBadge', () => {
  it('renders the favicon and the store name', () => {
    const { container } = renderWithProviders(
      <StoreBadge storeId={7} name="Amazon" hasFavicon />
    );

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      faviconUrl(7)
    );
  });

  it('renders nothing without a store name', () => {
    const { container } = renderWithProviders(
      <StoreBadge storeId={null} name={null} hasFavicon={false} />
    );

    expect(container.querySelector('img, svg')).toBeNull();
    // `queryAllByText` ignores the theme `<script>` the providers inject.
    expect(screen.queryAllByText(/\S/)).toHaveLength(0);
  });
});

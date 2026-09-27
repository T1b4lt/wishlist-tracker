import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import {
  buildDashboardProduct,
  buildMultiStoreProduct
} from '../../../e2e/fixtures/products';
import { OfferStores } from './OfferStores';

describe('OfferStores', () => {
  it('shows only the store for a single-store product', () => {
    renderWithProviders(
      <OfferStores product={buildDashboardProduct()} locale="en-US" />
    );

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });

  it('shows the best store and a chip listing every store', async () => {
    renderWithProviders(
      <OfferStores
        product={buildMultiStoreProduct({ best_offer_id: 2 })}
        locale="en-US"
      />
    );

    expect(screen.getByText('Thomann')).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: '+1 store' });
    await userEvent.hover(chip);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Amazon');
    expect(tooltip).toHaveTextContent('$199.99');
    expect(tooltip).toHaveTextContent('Best price');
  });

  it('names the store as text, without a second favicon', () => {
    const { container } = renderWithProviders(
      <OfferStores product={buildDashboardProduct()} locale="en-US" />
    );

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(container.querySelector('img, svg')).toBeNull();
  });
});

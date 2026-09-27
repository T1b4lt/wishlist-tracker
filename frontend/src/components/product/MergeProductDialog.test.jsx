import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useProductsStore } from '@/stores/productsStore';
import {
  buildDashboardProduct,
  buildOfferSummary,
  buildProductDetail
} from '../../../e2e/fixtures/products';
import { MergeProductDialog } from './MergeProductDialog';

const target = buildProductDetail({
  id: 1,
  name: 'Wireless Headphones',
  currency: 'USD'
});
const same = buildDashboardProduct({
  id: 2,
  name: 'WH-1000 Headphones',
  currency: 'USD',
  offers: [buildOfferSummary({ id: 5, store_name: 'Thomann' })]
});
const euro = buildDashboardProduct({
  id: 3,
  name: 'Euro gadget',
  currency: 'EUR'
});

describe('MergeProductDialog', () => {
  beforeEach(() => {
    useProductsStore.setState({
      items: [buildDashboardProduct({ id: 1 }), same, euro],
      status: 'success',
      merge: vi.fn().mockResolvedValue({})
    });
  });

  it('only offers other products in the same currency', async () => {
    renderWithProviders(
      <MergeProductDialog open onClose={vi.fn()} product={target} />
    );

    await userEvent.click(
      screen.getByRole('combobox', { name: /Other product/ })
    );

    expect(
      await screen.findByRole('option', { name: 'WH-1000 Headphones' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Euro gadget' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Wireless Headphones' })
    ).not.toBeInTheDocument();
  });

  it('merges keeping the chosen fields and previews the result', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <MergeProductDialog open onClose={onClose} product={target} />
    );

    await userEvent.click(
      screen.getByRole('combobox', { name: /Other product/ })
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'WH-1000 Headphones' })
    );
    await userEvent.click(screen.getByText('The other product'));

    expect(
      screen.getByText('Result: WH-1000 Headphones, tracked in 2 stores.')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(useProductsStore.getState().merge).toHaveBeenCalledWith(1, {
      source_product_id: 2,
      keep: 'source'
    });
    expect(onClose).toHaveBeenCalled();
  });
});

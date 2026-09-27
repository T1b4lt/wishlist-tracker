import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { products as productsApi } from '@/lib/api';
import { useProductsStore } from '@/stores/productsStore';
import { AddOfferDialog } from './AddOfferDialog';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, products: { ...actual.products, extractInfo: vi.fn() } };
});

const product = { id: 1, name: 'Drum kit', currency: 'EUR' };
const store = {
  id: 2,
  name: 'Amazon',
  domain: 'amazon.es',
  has_favicon: false
};

const fetchDetails = async (url) => {
  await userEvent.type(screen.getByLabelText(/Store URL/), url);
  await userEvent.click(
    screen.getByRole('button', { name: 'Fetch store details' })
  );
};

describe('AddOfferDialog', () => {
  beforeEach(() => {
    useProductsStore.setState({
      addOffer: vi.fn().mockResolvedValue({ id: 9 })
    });
  });

  it('adds the store after extracting it', async () => {
    productsApi.extractInfo.mockResolvedValue({ currency: 'EUR', store });
    const onClose = vi.fn();
    renderWithProviders(
      <AddOfferDialog open onClose={onClose} product={product} />
    );

    await fetchDetails('https://www.amazon.es/dp/KIT');
    expect(await screen.findByText('Amazon')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add store' }));

    expect(useProductsStore.getState().addOffer).toHaveBeenCalledWith(1, {
      url: 'https://www.amazon.es/dp/KIT',
      currency: 'EUR',
      store_id: 2
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks a store in another currency', async () => {
    productsApi.extractInfo.mockResolvedValue({ currency: 'USD', store });
    renderWithProviders(
      <AddOfferDialog open onClose={vi.fn()} product={product} />
    );

    await fetchDetails('https://www.amazon.com/dp/KIT');

    expect(
      await screen.findByText(
        'This store uses USD, but Drum kit is tracked in EUR.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add store' })).toBeDisabled();
  });

  it('shows an error when extraction fails', async () => {
    productsApi.extractInfo.mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <AddOfferDialog open onClose={vi.fn()} product={product} />
    );

    await fetchDetails('https://broken.example/x');

    expect(
      await screen.findByText(/couldn't read this page/)
    ).toBeInTheDocument();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useProductsStore } from '@/stores/productsStore';
import { buildOfferDetail } from '../../../e2e/fixtures/products';
import { EditOfferDialog } from './EditOfferDialog';

describe('EditOfferDialog', () => {
  beforeEach(() => {
    useProductsStore.setState({ updateOffer: vi.fn().mockResolvedValue({}) });
  });

  it('saves the new URL', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <EditOfferDialog
        open
        onClose={onClose}
        productId={1}
        offer={buildOfferDetail()}
      />
    );

    const input = screen.getByLabelText(/Store URL/);
    await userEvent.clear(input);
    await userEvent.type(input, 'https://example.com/new');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(useProductsStore.getState().updateOffer).toHaveBeenCalledWith(1, 1, {
      url: 'https://example.com/new'
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects an invalid URL', async () => {
    renderWithProviders(
      <EditOfferDialog
        open
        onClose={vi.fn()}
        productId={1}
        offer={buildOfferDetail()}
      />
    );

    const input = screen.getByLabelText(/Store URL/);
    await userEvent.clear(input);
    await userEvent.type(input, 'not a url');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Enter a valid http(s) URL.')).toBeInTheDocument();
    expect(useProductsStore.getState().updateOffer).not.toHaveBeenCalled();
  });
});

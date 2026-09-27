import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import {
  buildMultiStoreDetail,
  buildOfferDetail
} from '../../../e2e/fixtures/products';
import { OfferList } from './OfferList';

const renderList = (props = {}) => {
  const detail = buildMultiStoreDetail();
  const handlers = { onEdit: vi.fn(), onUnlink: vi.fn(), onRemove: vi.fn() };
  renderWithProviders(
    <OfferList
      offers={detail.offers}
      currency="USD"
      bestOfferId={1}
      locale="en-US"
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('OfferList', () => {
  it('lists every store with its price and marks the best one', () => {
    renderList();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Amazon')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Best price')).toBeInTheDocument();
    expect(within(rows[1]).getByText('$209.99')).toBeInTheDocument();
  });

  it('shows "Not checked yet" for a store without history', () => {
    renderList({
      offers: [
        buildOfferDetail(),
        buildOfferDetail({
          id: 2,
          store_name: 'Thomann',
          current_price: null,
          is_in_stock: null,
          last_checked_at: null,
          price_history: []
        })
      ]
    });

    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
  });

  it('calls the handlers from the row menu', async () => {
    const { onUnlink } = renderList();

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Thomann' })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Unlink/ })
    );

    expect(onUnlink).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('disables unlink and remove on the only store', async () => {
    renderList({ offers: [buildOfferDetail()] });

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Amazon' })
    );

    expect(
      await screen.findByRole('menuitem', { name: /Unlink/ })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('menuitem', { name: /Remove store/ })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows no "Best price" marker for a single store', () => {
    renderList({ offers: [buildOfferDetail()] });

    expect(screen.queryByText('Best price')).not.toBeInTheDocument();
  });
});

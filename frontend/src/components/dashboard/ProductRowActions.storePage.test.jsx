import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ProductRowActions } from './ProductRowActions';

// Kept in its own file: `ProductRowActions.test.jsx` already spends its one
// safe real open-and-select on "Open" (see the note there on why more than
// one live Chakra `Menu` open-and-select per test file/module is flaky in
// jsdom), so "Open store page" gets its own file rather than becoming a
// second one there.
// Tracked in two stores; the second one is the best offer.
const PRODUCT = {
  id: 3,
  name: 'Standing Desk',
  best_offer_id: 8,
  offers: [
    { id: 7, url: 'https://example.com/standing-desk' },
    { id: 8, url: 'https://other.example/standing-desk' }
  ]
};

describe('ProductRowActions "Open store page"', () => {
  it('opens the best offer url in a new tab, without bubbling to the row/card', async () => {
    const user = userEvent.setup();
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => {});
    const outerOnClick = vi.fn();

    renderWithProviders(
      <div onClick={outerOnClick}>
        <ProductRowActions
          product={PRODUCT}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: /actions for/i }));
    await user.click(
      screen.getByRole('menuitem', { name: /open store page/i })
    );

    expect(windowOpen).toHaveBeenCalledWith(
      'https://other.example/standing-desk',
      '_blank',
      'noopener,noreferrer'
    );
    expect(outerOnClick).not.toHaveBeenCalled();

    windowOpen.mockRestore();
  });
});

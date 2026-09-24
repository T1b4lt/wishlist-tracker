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
const PRODUCT = {
  id: 3,
  name: 'Standing Desk',
  url: 'https://example.com/standing-desk'
};

describe('ProductRowActions "Open store page"', () => {
  it('opens the product url in a new tab, without bubbling to the row/card', async () => {
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
      PRODUCT.url,
      '_blank',
      'noopener,noreferrer'
    );
    expect(outerOnClick).not.toHaveBeenCalled();

    windowOpen.mockRestore();
  });
});

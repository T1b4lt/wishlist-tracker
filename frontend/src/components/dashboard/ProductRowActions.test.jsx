import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { ProductRowActions } from './ProductRowActions';

const PRODUCT = {
  id: 3,
  name: 'Standing Desk',
  url: 'https://example.com/standing-desk'
};

/** Shows the current location, so a test can assert whether navigation happened. */
const LocationProbe = () => {
  const [location] = useLocation();
  return <div data-testid="location">{location}</div>;
};

describe('ProductRowActions', () => {
  it('renders the trigger with no console errors', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <ProductRowActions
        product={PRODUCT}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Actions for Standing Desk' })
    ).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  // Everything that needs the menu OPEN lives in this one test. Opening a
  // Chakra `Menu` a second time anywhere else in this file/module (even
  // just to open it, without selecting anything) is flaky in jsdom: Ark
  // UI's outside-click tracking for the menu content arms itself
  // asynchronously per open/close cycle, and a second cycle in the same
  // module can race it and silently swallow the next selection. "Edit"
  // (`ProductTable.test.jsx`) and "Delete" (`ProductCardList.test.jsx`)
  // already each get their own full open-and-select test elsewhere,
  // proving the same `<Menu.Item onSelect>` wiring end to end for those two
  // actions; this test covers the remaining two without repeating them.
  it('opens without bubbling, lists every action, and "Open" navigates without bubbling', async () => {
    const user = userEvent.setup();
    const outerOnClick = vi.fn();
    const { hook } = memoryLocation({ path: '/' });

    renderWithProviders(
      <Router hook={hook}>
        <LocationProbe />
        <div onClick={outerOnClick}>
          <ProductRowActions
            product={PRODUCT}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </div>
      </Router>
    );

    await user.click(screen.getByRole('button', { name: /actions for/i }));
    expect(outerOnClick).not.toHaveBeenCalled();

    // Every action is present. "Open store page" gets its own live click
    // test in `ProductRowActions.storePage.test.jsx` (a second real
    // open-and-select here would hit the same jsdom flakiness noted above);
    // "Edit" and "Delete" each get a full live test in `ProductTable.test.jsx`
    // and `ProductCardList.test.jsx` respectively.
    expect(
      screen.getByRole('menuitem', { name: /^open$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /^edit$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /open store page/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /^delete$/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /^open$/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/product/3');
    expect(outerOnClick).not.toHaveBeenCalled();
  });
});

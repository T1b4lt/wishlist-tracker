import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DEFAULT_FILTERS } from '@/lib/productFilters';
import { ProductFilterBar } from './ProductFilterBar';

const OPTIONS = {
  stores: [
    { id: 1, name: 'Amazon' },
    { id: 2, name: 'PcComponentes' }
  ],
  categories: [
    { id: 1, name: 'Drones', color: '#3B82F6' },
    { id: 2, name: 'Audio', color: '#EF4444' }
  ]
};

/**
 * Renders the bar with real, local filter state, so each test drives it
 * exactly like the dashboard does. `onChange`/`onReset` spies still see
 * every call.
 */
const renderBar = ({
  initialFilters = {},
  shownCount = 3,
  totalCount = 5
} = {}) => {
  const onChange = vi.fn();
  const onReset = vi.fn();

  const Harness = () => {
    const [filters, setFilters] = useState({
      ...DEFAULT_FILTERS,
      ...initialFilters
    });
    return (
      <ProductFilterBar
        filters={filters}
        options={OPTIONS}
        shownCount={shownCount}
        totalCount={totalCount}
        locale="en-US"
        onChange={(patch) => {
          onChange(patch);
          setFilters((current) => ({ ...current, ...patch }));
        }}
        onReset={() => {
          onReset();
          setFilters((current) => ({ ...DEFAULT_FILTERS, sort: current.sort }));
        }}
      />
    );
  };

  renderWithProviders(<Harness />);
  return { onChange, onReset, user: userEvent.setup() };
};

describe('ProductFilterBar', () => {
  it('updates the query on every keystroke', async () => {
    const { onChange, user } = renderBar();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search products' }),
      'DJI'
    );

    expect(onChange).toHaveBeenLastCalledWith({ query: 'DJI' });
    expect(screen.getByRole('searchbox')).toHaveValue('DJI');
  });

  it('clears the query with the clear button', async () => {
    const { onChange, user } = renderBar({ initialFilters: { query: 'dji' } });

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(onChange).toHaveBeenLastCalledWith({ query: '' });
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('hides the clear button while the query is empty', () => {
    renderBar();
    expect(
      screen.queryByRole('button', { name: 'Clear search' })
    ).not.toBeInTheDocument();
  });

  it('shows how many products match', () => {
    renderBar({ shownCount: 2, totalCount: 5 });
    expect(screen.getByText('Showing 2 of 5 products')).toBeInTheDocument();
  });

  it('changes the sort order', async () => {
    const { onChange, user } = renderBar();

    await user.click(screen.getByRole('combobox', { name: 'Sort by' }));
    await user.click(
      await screen.findByRole('option', { name: 'Price: low to high' })
    );

    expect(onChange).toHaveBeenLastCalledWith({ sort: 'price_asc' });
  });

  it('shows the number of active filters on the filters button', () => {
    renderBar({ initialFilters: { stores: [1], stock: 'in' } });
    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent(
      '2'
    );
  });

  describe('filter panel', () => {
    const openPanel = async (user) => {
      await user.click(screen.getByRole('button', { name: /Filters/ }));
      return screen.findByRole('dialog', { name: 'Filter products' });
    };

    it('toggles a store', async () => {
      const { onChange, user } = renderBar();
      const panel = await openPanel(user);

      await user.click(
        within(panel).getByRole('checkbox', { name: 'PcComponentes' })
      );

      expect(onChange).toHaveBeenLastCalledWith({ stores: [2] });
    });

    it('toggles a category and a priority', async () => {
      const { onChange, user } = renderBar();
      const panel = await openPanel(user);

      await user.click(within(panel).getByRole('checkbox', { name: 'Audio' }));
      expect(onChange).toHaveBeenLastCalledWith({ categories: [2] });

      await user.click(within(panel).getByRole('checkbox', { name: 'High' }));
      expect(onChange).toHaveBeenLastCalledWith({ priorities: ['high'] });
    });

    it('picks a stock filter', async () => {
      const { onChange, user } = renderBar();
      const panel = await openPanel(user);

      await user.click(
        within(panel).getByRole('radio', { name: 'Out of stock' })
      );

      expect(onChange).toHaveBeenLastCalledWith({ stock: 'out' });
    });

    it('toggles the deal filters', async () => {
      const { onChange, user } = renderBar();
      const panel = await openPanel(user);

      await user.click(
        within(panel).getByRole('checkbox', { name: 'Price dropped' })
      );
      expect(onChange).toHaveBeenLastCalledWith({ priceDrop: true });

      await user.click(
        within(panel).getByRole('checkbox', { name: 'At lowest price' })
      );
      expect(onChange).toHaveBeenLastCalledWith({ atLowest: true });
    });

    it('sets a price range, keeping partial decimal input editable', async () => {
      const { onChange, user } = renderBar();
      const panel = await openPanel(user);

      const min = within(panel).getByRole('textbox', { name: 'Min' });
      await user.type(min, '10.');
      expect(min).toHaveValue('10.');
      await user.type(min, '5');
      expect(onChange).toHaveBeenLastCalledWith({ minPrice: 10.5 });

      await user.type(
        within(panel).getByRole('textbox', { name: 'Max' }),
        '200'
      );
      expect(onChange).toHaveBeenLastCalledWith({ maxPrice: 200 });

      await user.clear(min);
      expect(onChange).toHaveBeenLastCalledWith({ minPrice: null });
    });

    it('accepts a comma as the decimal separator', async () => {
      const { onChange, user } = renderBar();
      const panel = await openPanel(user);

      await user.type(
        within(panel).getByRole('textbox', { name: 'Max' }),
        '99,95'
      );

      expect(onChange).toHaveBeenLastCalledWith({ maxPrice: 99.95 });
    });
  });

  describe('active filter chips', () => {
    it('shows one chip per active value, with readable labels', () => {
      renderBar({
        initialFilters: {
          stores: [1],
          categories: [2],
          priorities: ['low'],
          stock: 'in',
          minPrice: 10,
          maxPrice: 50,
          priceDrop: true
        }
      });

      for (const label of [
        'Amazon',
        'Audio',
        'Low',
        'In stock',
        '10 – 50',
        'Price dropped'
      ]) {
        expect(
          screen.getByRole('button', { name: `Remove filter: ${label}` })
        ).toBeInTheDocument();
      }
    });

    it('removes a single value when its chip is dismissed', async () => {
      const { onChange, user } = renderBar({
        initialFilters: { stores: [1, 2] }
      });

      await user.click(
        screen.getByRole('button', { name: 'Remove filter: Amazon' })
      );

      expect(onChange).toHaveBeenLastCalledWith({ stores: [2] });
      expect(
        screen.queryByRole('button', { name: 'Remove filter: Amazon' })
      ).not.toBeInTheDocument();
    });

    it('clears every filter with "Clear all"', async () => {
      const { onReset, user } = renderBar({
        initialFilters: { stores: [1], priceDrop: true }
      });

      await user.click(screen.getByRole('button', { name: 'Clear all' }));

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole('button', { name: /Remove filter/ })
      ).not.toBeInTheDocument();
    });

    it('shows no chips and no "Clear all" without active filters', () => {
      renderBar({ initialFilters: { query: 'dji' } });
      expect(
        screen.queryByRole('button', { name: 'Clear all' })
      ).not.toBeInTheDocument();
    });
  });
});

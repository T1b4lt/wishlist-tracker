import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { ProductDescription } from './ProductDescription';

/** Stubs the clamped paragraph's measured heights for the duration of `run`,
 * simulating whether its content overflows the 4-line clamp. jsdom always
 * reports `0` for both, which would never show the toggle. */
const withMeasuredHeights = (scrollHeight, clientHeight) => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
    scrollHeight
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
    clientHeight
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductDescription', () => {
  it('renders nothing when there is no description', () => {
    renderWithProviders(<ProductDescription description="" />);

    expect(screen.queryByText('Description')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the description without a toggle when it fits within the clamp', () => {
    withMeasuredHeights(80, 80);
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<ProductDescription description="Short text" />);

    expect(screen.getByText('Short text')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /show more/i })
    ).not.toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('shows a Show more toggle when the description overflows, and it expands and collapses it', async () => {
    withMeasuredHeights(200, 80);
    const user = userEvent.setup();

    renderWithProviders(
      <ProductDescription description="A very long product description." />
    );

    const toggle = screen.getByRole('button', { name: 'Show more' });
    await user.click(toggle);

    expect(
      screen.getByRole('button', { name: 'Show less' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));

    expect(
      screen.getByRole('button', { name: 'Show more' })
    ).toBeInTheDocument();
  });

  it('marks the toggle with aria-expanded and aria-controls pointing at the clamped text', async () => {
    withMeasuredHeights(200, 80);
    const user = userEvent.setup();

    renderWithProviders(
      <ProductDescription description="A very long product description." />
    );

    const toggle = screen.getByRole('button', { name: 'Show more' });
    const content = screen.getByText('A very long product description.');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', content.id);

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('re-measures overflow via ResizeObserver when the text node is resized, without description/expanded changing', () => {
    let resizeCallback;
    const originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    try {
      withMeasuredHeights(200, 80);
      renderWithProviders(
        <ProductDescription description="A very long product description." />
      );
      expect(
        screen.getByRole('button', { name: 'Show more' })
      ).toBeInTheDocument();

      // Simulate a layout change (e.g. the viewport growing wider) that
      // makes the same text now fit within the clamp, without `description`
      // or `isExpanded` changing.
      withMeasuredHeights(80, 80);
      act(() => resizeCallback());

      expect(
        screen.queryByRole('button', { name: /show more/i })
      ).not.toBeInTheDocument();
    } finally {
      window.ResizeObserver = originalResizeObserver;
    }
  });
});

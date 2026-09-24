import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { AnimatedList, AnimatedListItem } from './AnimatedList';

describe('AnimatedList', () => {
  it('renders a div list with div items by default, with no console errors', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <AnimatedList data-testid="list">
        <AnimatedListItem key="one" data-testid="item">
          <span>Row one</span>
        </AnimatedListItem>
      </AnimatedList>
    );

    expect(screen.getByTestId('list').tagName).toBe('DIV');
    expect(screen.getByTestId('item').tagName).toBe('DIV');
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders as a ul with li items with no console errors (valid nesting)', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <AnimatedList as="ul" data-testid="list">
        <AnimatedListItem as="li" key="one" data-testid="item-one">
          <span>Row one</span>
        </AnimatedListItem>
        <AnimatedListItem as="li" key="two" data-testid="item-two">
          <span>Row two</span>
        </AnimatedListItem>
      </AnimatedList>
    );

    const list = screen.getByTestId('list');
    expect(list.tagName).toBe('UL');
    expect(screen.getByTestId('item-one').tagName).toBe('LI');
    expect(screen.getByTestId('item-two').tagName).toBe('LI');
    // Every direct child of the <ul> must itself be an <li> (no <div>
    // wrapper sneaking in between), or the markup is invalid.
    Array.from(list.children).forEach((child) => {
      expect(child.tagName).toBe('LI');
    });
    expect(getUnexpectedErrors()).toEqual([]);
  });
});

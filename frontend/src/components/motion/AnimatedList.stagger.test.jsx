import { forwardRef } from 'react';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { Provider } from '@/components/ui/provider';
import i18n from '@/i18n/index.js';
import { renderWithProviders } from '@/test/renderWithProviders';
import { staggerStepSeconds } from '@/theme/motion';

/**
 * `AnimatedListItem` renders through Motion, which animates by ticking
 * styles on `requestAnimationFrame` rather than setting an inspectable
 * `transition-delay` CSS property, so its actual entrance delay is not
 * observable from the rendered DOM in jsdom. Replacing `motion.div`/`li`
 * with a plain passthrough that surfaces the computed
 * `animate.transition.delay` as a `data-enter-delay` attribute lets these
 * tests assert on that value directly, the same way `reducedMotion.test.jsx`
 * mocks `useReducedMotion` to test a value Motion itself does not expose.
 */
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal();
  // Motion-only props that must not leak onto the plain DOM element below
  // as invalid attributes; only `animate` (for its computed entrance
  // delay) is actually read.
  const MOTION_ONLY_PROPS = [
    'animate',
    'transition',
    'initial',
    'exit',
    'layout'
  ];
  const passthrough = (tag) =>
    forwardRef((props, ref) => {
      const rest = { ...props };
      for (const prop of MOTION_ONLY_PROPS) delete rest[prop];
      const enterDelay =
        props.animate && typeof props.animate === 'object'
          ? props.animate.transition?.delay
          : undefined;
      const Tag = tag;
      return <Tag ref={ref} data-enter-delay={enterDelay ?? ''} {...rest} />;
    });
  return {
    ...actual,
    motion: {
      div: passthrough('div'),
      li: passthrough('li'),
      tr: passthrough('tr'),
      span: passthrough('span')
    }
  };
});

const { AnimatedList, AnimatedListItem } = await import('./AnimatedList');

/** Same wrapping as `renderWithProviders`, for `rerender` calls (which
 * replace the whole tree `render` was given, so it has to be reapplied). */
const wrap = (ui) => (
  <Provider>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </Provider>
);

const enterDelayOf = (testId) =>
  Number(screen.getByTestId(testId).getAttribute('data-enter-delay'));

describe('AnimatedList stagger delay', () => {
  it('applies the capped index-based delay to items present in the initial render', () => {
    renderWithProviders(
      <AnimatedList as="ul">
        <AnimatedListItem
          as="li"
          key="a"
          delay={2 * staggerStepSeconds}
          data-testid="item-a"
        >
          a
        </AnimatedListItem>
        {/* Index 20 would be 0.8s uncapped; capped at 8 steps (0.32s). */}
        <AnimatedListItem
          as="li"
          key="b"
          delay={20 * staggerStepSeconds}
          data-testid="item-b"
        >
          b
        </AnimatedListItem>
      </AnimatedList>
    );

    expect(enterDelayOf('item-a')).toBeCloseTo(2 * staggerStepSeconds);
    expect(enterDelayOf('item-b')).toBeCloseTo(8 * staggerStepSeconds);
  });

  it('gives an item added after the list has already mounted no entrance delay', () => {
    const { rerender } = renderWithProviders(
      <AnimatedList as="ul">
        <AnimatedListItem
          as="li"
          key="a"
          delay={5 * staggerStepSeconds}
          data-testid="item-a"
        >
          a
        </AnimatedListItem>
      </AnimatedList>
    );

    expect(enterDelayOf('item-a')).toBeCloseTo(5 * staggerStepSeconds);

    // Simulate a new row appearing later (e.g. a just-created product),
    // without ever unmounting `AnimatedList` itself.
    rerender(
      wrap(
        <AnimatedList as="ul">
          <AnimatedListItem
            as="li"
            key="a"
            delay={5 * staggerStepSeconds}
            data-testid="item-a"
          >
            a
          </AnimatedListItem>
          <AnimatedListItem
            as="li"
            key="new"
            delay={5 * staggerStepSeconds}
            data-testid="item-new"
          >
            new
          </AnimatedListItem>
        </AnimatedList>
      )
    );

    // The pre-existing item keeps whatever it already had; the new one,
    // despite requesting the same `delay`, gets none.
    expect(enterDelayOf('item-a')).toBeCloseTo(5 * staggerStepSeconds);
    expect(enterDelayOf('item-new')).toBe(0);
  });
});

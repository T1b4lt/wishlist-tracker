import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import { Box } from '@chakra-ui/react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { durationSeconds, easeOut, staggerStepSeconds } from '@/theme/motion';
import { motionElements } from './motionElements';

const noopSubscribe = () => () => {};
const noopGetSnapshot = () => false;

/**
 * Whether the nearest `AnimatedList` ancestor has already completed its
 * first render, provided to descendants as a `useSyncExternalStore` pair
 * (`subscribe`/`getSnapshot`) rather than a raw ref. `AnimatedListItem`
 * reading a ref's `.current` directly during render - even inside a
 * `useState` lazy initializer, which still runs during the render phase -
 * is exactly the "accessed a ref during render" pattern `eslint-plugin-
 * react-hooks` flags (it can behave inconsistently across a concurrent
 * re-render); `useSyncExternalStore` is React's sanctioned way to read a
 * value that lives outside React's own state during render. `null` outside
 * an `AnimatedList` (an `AnimatedListItem` used standalone, with no
 * provider) falls back to `noopSubscribe`/`noopGetSnapshot`, which always
 * reports "not yet mounted", i.e. its `delay` still applies - matching this
 * component's behavior before this mount-tracking existed.
 */
const AnimatedListMountContext = createContext(null);

/** Caps a staggered list's entrance delay so a long list's tail is not left
 * fading in for seconds; matches `Stagger`'s own per-item cadence intent. */
const MAX_STAGGER_DELAY_SECONDS = 8 * staggerStepSeconds;

/**
 * A list container for items that can be added or removed after mount.
 * Wraps `AnimatePresence` (`mode="popLayout"`) so a removed `AnimatedListItem`
 * animates out while its siblings reflow, instead of the list jumping.
 * `position="relative"` so an exiting item (popped out of layout by
 * `popLayout`) positions itself against the list rather than an ancestor.
 *
 * Tracks whether it has completed its first render (exposed to descendants
 * through context, as a `useSyncExternalStore` store - see
 * `AnimatedListMountContext`): an `AnimatedListItem` given a `delay` only
 * actually applies it while this is still `false`, so a later addition to
 * an already-mounted list (e.g. a newly created product) enters immediately
 * instead of inheriting a stagger meant for the initial batch.
 *
 * Renders as a `Box` (defaults to a `div`; pass `as="ul"` for a semantic
 * list, pairing each child's `AnimatedListItem as="li"`) so callers can
 * style the container (spacing, direction) with ordinary Chakra props.
 * Give each `AnimatedListItem` a stable `key` (the item's id) so exit
 * animations match the right element.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - `AnimatedListItem` elements, keyed by id.
 * @param {object} [rest] - Forwarded to the underlying `Box`.
 */
export const AnimatedList = ({ children, ...rest }) => {
  const hasMountedRef = useRef(false);
  // Built once (a stable object, not a new one each render): a
  // `useSyncExternalStore` store's `subscribe`/`getSnapshot` should stay
  // referentially stable across renders.
  const [store] = useState(() => ({
    subscribe: noopSubscribe,
    getSnapshot: () => hasMountedRef.current
  }));

  useEffect(() => {
    // A plain ref mutation, not a `setState` call, run once after the
    // initial commit. Nothing needs to be notified of this: no
    // already-rendered `AnimatedListItem` should change behavior once it
    // has rendered - only an item added afterward, on its own first
    // render, ever reads this (see `AnimatedListItem`), and `getSnapshot`
    // is read fresh on every render regardless of any notification.
    hasMountedRef.current = true;
  }, []);

  return (
    <Box position="relative" {...rest}>
      <AnimatedListMountContext.Provider value={store}>
        <AnimatePresence mode="popLayout">{children}</AnimatePresence>
      </AnimatedListMountContext.Provider>
    </Box>
  );
};

/**
 * One item of an `AnimatedList`. Fades in on mount (optionally staggered by
 * `delay`, capped at `MAX_STAGGER_DELAY_SECONDS` and applied only while the
 * parent `AnimatedList` is still on its first render - see there); on
 * removal, fades out and collapses its height so the remaining siblings
 * (animated via `layout`) slide into place instead of jumping.
 *
 * `delay` only ever applies to that entrance fade-in: it is nested inside
 * the `animate` target rather than passed through the shared top-level
 * `transition`, so a later reflow (`layout`) or an exit does not inherit an
 * already-mounted item's stagger offset (which, for `layout`, would delay
 * every remaining row/card by its own index every time the list changes).
 *
 * Renders as a `div` by default; pass `as="li"` (inside an
 * `AnimatedList as="ul"`), `as="tr"` or `as="span"` to nest correctly in a
 * semantic list, table or inline container instead. Picked from
 * `motionElements` rather than swapped through Chakra's usual `as` prop,
 * since `MotionBox` (`chakra(motion.div)`) cannot swap its tag that way
 * (see `motionElements.js`).
 *
 * Prefer `gap` on the `AnimatedList` container over margin between items:
 * only `transform`, `opacity` and `height` are animated here, so a margin
 * would not collapse along with the height and could leave a brief gap.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {'div' | 'li' | 'tr' | 'span'} [props.as] - The tag to render as. Defaults to `div`.
 * @param {number} [props.delay] - Entrance-only stagger delay, in seconds
 *   (e.g. `index * staggerStepSeconds`), only while the list is still on its
 *   initial render (see `AnimatedList`) and capped at
 *   `MAX_STAGGER_DELAY_SECONDS`. Defaults to `0`.
 * @param {object} [rest] - Forwarded to the underlying Motion + Chakra element.
 */
export const AnimatedListItem = ({
  as = 'div',
  delay = 0,
  children,
  ...rest
}) => {
  const shouldReduceMotion = useReducedMotion();
  const Component = motionElements[as] ?? motionElements.div;
  const store = useContext(AnimatedListMountContext);
  const hasMounted = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? noopGetSnapshot
  );
  // Freeze once, at this item's own first render: was the parent list
  // already past its initial render at that point? A `useState` lazy
  // initializer (not a plain `const`) so this is captured exactly once per
  // item instance and never recomputed when `hasMounted` changes later on
  // some unrelated re-render of this same, already-mounted item.
  const [wasAddedAfterInitialMount] = useState(() => hasMounted);
  const enterDelay = wasAddedAfterInitialMount
    ? 0
    : Math.min(delay, MAX_STAGGER_DELAY_SECONDS);

  return (
    <Component
      layout={!shouldReduceMotion}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        transition: {
          duration: shouldReduceMotion ? 0 : durationSeconds.normal,
          ease: easeOut,
          delay: shouldReduceMotion ? 0 : enterDelay
        }
      }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : durationSeconds.normal,
        ease: easeOut
      }}
      style={{ overflow: 'hidden' }}
      {...rest}
    >
      {children}
    </Component>
  );
};

import { Box } from '@chakra-ui/react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { durationSeconds, easeOut } from '@/theme/motion';
import { motionElements } from './motionElements';

/**
 * A list container for items that can be added or removed after mount.
 * Wraps `AnimatePresence` (`mode="popLayout"`) so a removed `AnimatedListItem`
 * animates out while its siblings reflow, instead of the list jumping.
 * `position="relative"` so an exiting item (popped out of layout by
 * `popLayout`) positions itself against the list rather than an ancestor.
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
export const AnimatedList = ({ children, ...rest }) => (
  <Box position="relative" {...rest}>
    <AnimatePresence mode="popLayout">{children}</AnimatePresence>
  </Box>
);

/**
 * One item of an `AnimatedList`. Fades in on mount (optionally staggered by
 * `delay`); on removal, fades out and collapses its height so the remaining
 * siblings (animated via `layout`) slide into place instead of jumping.
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
 *   (e.g. `index * staggerStepSeconds`). Defaults to `0`.
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

  return (
    <Component
      layout={!shouldReduceMotion}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        transition: {
          duration: shouldReduceMotion ? 0 : durationSeconds.normal,
          ease: easeOut,
          delay: shouldReduceMotion ? 0 : delay
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

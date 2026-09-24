import { Box } from '@chakra-ui/react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { durationSeconds, easeOut } from '@/theme/motion';
import { MotionBox } from './MotionBox';

/**
 * A list container for items that can be added or removed after mount.
 * Wraps `AnimatePresence` (`mode="popLayout"`) so a removed `AnimatedListItem`
 * animates out while its siblings reflow, instead of the list jumping.
 *
 * Renders as a `Box` (defaults to a `div`; pass `as="ul"` for a semantic
 * list) so callers can style the container (spacing, direction) with
 * ordinary Chakra props. Give each `AnimatedListItem` a stable `key` (the
 * item's id) so exit animations match the right element.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - `AnimatedListItem` elements, keyed by id.
 * @param {object} [rest] - Forwarded to the underlying `Box`.
 */
export const AnimatedList = ({ children, ...rest }) => (
  <Box {...rest}>
    <AnimatePresence mode="popLayout">{children}</AnimatePresence>
  </Box>
);

/**
 * One item of an `AnimatedList`. Fades in on mount; on removal, fades out
 * and collapses its height so the remaining siblings (animated via
 * `layout`) slide into place instead of jumping.
 *
 * Prefer `gap` on the `AnimatedList` container over margin between items:
 * only `transform`, `opacity` and `height` are animated here, so a margin
 * would not collapse along with the height and could leave a brief gap.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {object} [rest] - Forwarded to the underlying `MotionBox`.
 */
export const AnimatedListItem = ({ children, ...rest }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <MotionBox
      layout={!shouldReduceMotion}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : durationSeconds.normal,
        ease: easeOut
      }}
      style={{ overflow: 'hidden' }}
      {...rest}
    >
      {children}
    </MotionBox>
  );
};

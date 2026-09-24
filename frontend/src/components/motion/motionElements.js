import { chakra } from '@chakra-ui/react';
import { motion } from 'motion/react';
import { MotionBox } from './MotionBox';

/**
 * Motion + Chakra components for the handful of tags other than `div` that
 * a preset may need to render as, so it nests correctly in a semantic
 * container (an `<li>` inside a `<ul>`, a `<tr>` inside a `<tbody>`, ...)
 * while still getting Motion's animation props and Chakra's style props.
 *
 * `chakra(motion.div)` (`MotionBox`) does not support swapping its tag
 * through an `as` prop the way a plain Chakra `Box` does: `as` only swaps
 * the rendered tag when the wrapped base is itself a string ("div", "li",
 * ...); when the base is a component (here, `motion.div`), Chakra instead
 * forwards `as` as a plain prop, which `motion.div` does not understand, so
 * it leaks onto the DOM and the element still renders as a `div`. Picking
 * the already-correct wrapped component from this map (rather than
 * building one on the fly from an `as` prop) sidesteps that.
 *
 * Built once, at module scope, so each tag keeps a stable component
 * identity across renders: looking a tag up by name does not create a new
 * component type, which would otherwise force React to unmount and
 * remount the element on every render.
 */
export const motionElements = {
  div: MotionBox,
  li: chakra(motion.li),
  tr: chakra(motion.tr),
  span: chakra(motion.span)
};

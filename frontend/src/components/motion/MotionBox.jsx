import { chakra } from '@chakra-ui/react';
import { motion } from 'motion/react';

/**
 * A `Box` that also accepts Motion props (`initial`, `animate`, `exit`,
 * `variants`, `transition`, `layout`, ...).
 *
 * Composed as `chakra(motion.div)`, Chakra outer / Motion inner: Chakra's
 * factory strips its own style props before forwarding the rest to
 * `motion.div`, which in turn filters `initial` / `animate` / `exit` /
 * `variants` / `transition` / `layout` before they ever reach the real DOM
 * node. The reverse order (`motion.create(Box)`) forwards every prop
 * (including Motion-only ones) straight to `Box`, which does not know to
 * filter them and leaks them onto the DOM as invalid HTML attributes.
 */
export const MotionBox = chakra(motion.div);

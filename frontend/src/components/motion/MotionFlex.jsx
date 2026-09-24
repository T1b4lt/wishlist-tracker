import { chakra } from '@chakra-ui/react';
import { motion } from 'motion/react';

/**
 * A `Flex` (`display: flex`) that also accepts Motion props. See
 * `MotionBox` for why it is composed as `chakra(motion.div)` rather than
 * `motion.create(Flex)`.
 */
export const MotionFlex = chakra(motion.div, {
  base: { display: 'flex' }
});

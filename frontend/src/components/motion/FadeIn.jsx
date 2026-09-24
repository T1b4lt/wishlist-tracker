import { useReducedMotion } from 'motion/react';
import { durationSeconds, easeOut } from '@/theme/motion';
import { MotionBox } from './MotionBox';

/**
 * Fades content in on mount, sliding up from 8px below its resting position.
 * Renders as an instant, transform-free opacity change when the user
 * prefers reduced motion.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {number} [props.delay] - Delay before the animation starts, in seconds. Useful for sequencing a few `FadeIn`s by hand.
 * @param {number} [props.duration] - Animation duration, in seconds. Defaults to the shared `normal` duration.
 * @param {object} [rest] - Forwarded to the underlying `MotionBox` (Chakra style props included).
 */
export const FadeIn = ({
  children,
  delay = 0,
  duration = durationSeconds.normal,
  ...rest
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <MotionBox
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : duration,
        delay: shouldReduceMotion ? 0 : delay,
        ease: easeOut
      }}
      {...rest}
    >
      {children}
    </MotionBox>
  );
};

import { useReducedMotion } from 'motion/react';
import { durationSeconds, easeOut } from '@/theme/motion';
import { MotionBox } from './MotionBox';

/**
 * Fades a page in (sliding up 6px) and out (sliding down 6px) on route
 * change. Meant to be the single child of an `AnimatePresence`, keyed by
 * the current location, wrapping the router outlet (see `AppShell`).
 *
 * Renders as an instant, transform-free opacity change when the user
 * prefers reduced motion.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - The current route's page.
 * @param {object} [rest] - Forwarded to the underlying `MotionBox`.
 */
export const PageTransition = ({ children, ...rest }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <MotionBox
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{
        duration: shouldReduceMotion ? 0 : durationSeconds.normal,
        ease: easeOut
      }}
      {...rest}
    >
      {children}
    </MotionBox>
  );
};

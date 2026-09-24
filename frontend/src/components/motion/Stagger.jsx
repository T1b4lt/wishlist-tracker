import { useReducedMotion } from 'motion/react';
import { durationSeconds, easeOut, staggerStepSeconds } from '@/theme/motion';
import { MotionBox } from './MotionBox';

/**
 * A container that staggers the entrance of its `StaggerItem` children
 * (~0.04s apart). `StaggerItem` children inherit the `hidden` / `visible`
 * variant names automatically through Motion's variant propagation; they
 * do not need their own `initial` / `animate` props.
 *
 * When the user prefers reduced motion, children still fade in (no
 * transform, no stagger delay).
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - `StaggerItem` elements.
 * @param {object} [rest] - Forwarded to the underlying `MotionBox`.
 */
export const Stagger = ({ children, ...rest }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <MotionBox
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: shouldReduceMotion
            ? {}
            : { staggerChildren: staggerStepSeconds }
        }
      }}
      {...rest}
    >
      {children}
    </MotionBox>
  );
};

/**
 * One child of `Stagger`. Fades in (and, unless reduced motion is
 * preferred, slides up by 8px) once its parent's stagger reaches it.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {object} [rest] - Forwarded to the underlying `MotionBox`.
 */
export const StaggerItem = ({ children, ...rest }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <MotionBox
      variants={{
        hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
        visible: {
          opacity: 1,
          ...(shouldReduceMotion ? {} : { y: 0 }),
          transition: {
            duration: shouldReduceMotion ? 0 : durationSeconds.normal,
            ease: easeOut
          }
        }
      }}
      {...rest}
    >
      {children}
    </MotionBox>
  );
};

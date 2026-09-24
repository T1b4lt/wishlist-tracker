import { defineTokens } from '@chakra-ui/react';

/**
 * Shared motion constants: durations, easings and a spring, used by both
 * Chakra's CSS transitions (through `tokens.durations` / `tokens.easings`
 * below) and the Motion presets in `src/components/motion/`, so CSS
 * transitions and Motion animations stay in sync.
 *
 * Keep these as the single source of truth: anything that needs a duration,
 * easing or spring should import from here rather than hard-coding values.
 */

/** Animation durations, in seconds (for Motion) and as CSS values (for Chakra). */
export const durationSeconds = {
  fast: 0.15,
  normal: 0.22,
  slow: 0.35
};

/** The `easeOut`-style cubic bezier used across the app. */
export const easeOut = [0.16, 1, 0.3, 1];

/** The shared spring used for interactive, physical motion (e.g. presses). */
export const spring = { type: 'spring', stiffness: 400, damping: 32 };

/** Chakra tokens: `durations.fast` / `.normal` / `.slow`, in milliseconds. */
export const durations = defineTokens.durations({
  fast: { value: `${durationSeconds.fast * 1000}ms` },
  normal: { value: `${durationSeconds.normal * 1000}ms` },
  slow: { value: `${durationSeconds.slow * 1000}ms` }
});

/** Chakra tokens: `easings.easeOut`, as a CSS `cubic-bezier(...)`. */
export const easings = defineTokens.easings({
  easeOut: { value: `cubic-bezier(${easeOut.join(', ')})` }
});

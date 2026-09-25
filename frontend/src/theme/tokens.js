import { defineTokens } from '@chakra-ui/react';

/**
 * Raw design tokens: fonts, radii and colors.
 *
 * Components should not use these color values directly. Use the semantic
 * tokens from `semanticTokens.js` (`bg`, `fg`, `accent`, `price.*`, ...),
 * which resolve per color mode.
 */

/** Font stacks. Geist is self-hosted through Fontsource (see `main.jsx`). */
export const fonts = defineTokens.fonts({
  heading: { value: `'Geist Variable', system-ui, sans-serif` },
  body: { value: `'Geist Variable', system-ui, sans-serif` },
  mono: { value: `'Geist Mono Variable', ui-monospace, monospace` }
});

/**
 * Radii following the shape rule: inputs and buttons `md` (8px), cards and
 * dialogs `lg` (12px), tags and badges `full`.
 */
export const radii = defineTokens.radii({
  md: { value: '0.5rem' },
  lg: { value: '0.75rem' },
  xl: { value: '1rem' }
});

export const colors = defineTokens.colors({
  /**
   * Monochrome cool-neutral (zinc-like) scale, from off-white (`25`) to
   * off-black (`975`). Never pure `#fff` or `#000`.
   */
  neutral: {
    25: { value: '#fcfcfc' },
    50: { value: '#f7f7f8' },
    100: { value: '#f1f1f3' },
    200: { value: '#e4e4e7' },
    300: { value: '#d4d4d8' },
    400: { value: '#a1a1aa' },
    450: { value: '#8b8b94' },
    500: { value: '#71717a' },
    // Slightly darker than `500`, used only where a lighter-weight text
    // color still needs to clear AA contrast on a tinted (`bg.muted`)
    // surface, not just the plain `bg` (see `fg.subtle` below).
    550: { value: '#65656d' },
    600: { value: '#52525b' },
    700: { value: '#3f3f46' },
    800: { value: '#27272a' },
    900: { value: '#18181b' },
    950: { value: '#111113' },
    975: { value: '#09090b' }
  },
  /**
   * Muted, desaturated colors reserved for data semantics (price change,
   * stock). `600` is tuned for text on light backgrounds and `300` for text
   * on dark backgrounds; both pass WCAG AA on `bg`, `bg.subtle` and
   * `bg.muted`.
   */
  signal: {
    green: {
      300: { value: '#7cc49a' },
      600: { value: '#2e7050' }
    },
    red: {
      300: { value: '#ec8a84' },
      600: { value: '#b23b3b' }
    }
  }
});

export const tokens = { fonts, radii, colors };

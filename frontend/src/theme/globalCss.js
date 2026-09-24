import { defineGlobalStyles } from '@chakra-ui/react';

/**
 * App-wide base styles: page colors from semantic tokens, a visible focus
 * outline for keyboard users and a reduced-motion override that switches off
 * transitions and animations.
 */
export const globalCss = defineGlobalStyles({
  body: {
    bg: 'bg',
    color: 'fg',
    fontFamily: 'body',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale'
  },
  ':focus-visible': {
    outlineWidth: '2px',
    outlineStyle: 'solid',
    outlineColor: 'fg',
    outlineOffset: '2px'
  },
  '@media (prefers-reduced-motion: reduce)': {
    '*, *::before, *::after': {
      animationDuration: '0.01ms !important',
      animationIterationCount: '1 !important',
      transitionDuration: '0.01ms !important',
      scrollBehavior: 'auto !important'
    }
  }
});

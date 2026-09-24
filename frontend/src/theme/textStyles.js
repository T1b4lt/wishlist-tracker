import { defineTextStyles } from '@chakra-ui/react';

/**
 * Typography scale. Use through the `textStyle` prop, e.g.
 * `<Text textStyle="heading.md">` or `<Text textStyle="numeric">`.
 */
export const textStyles = defineTextStyles({
  display: {
    value: {
      fontFamily: 'heading',
      fontSize: '4xl',
      fontWeight: 'semibold',
      lineHeight: '1.1',
      letterSpacing: '-0.03em'
    }
  },
  heading: {
    lg: {
      value: {
        fontFamily: 'heading',
        fontSize: '2xl',
        fontWeight: 'semibold',
        lineHeight: '1.2',
        letterSpacing: '-0.02em'
      }
    },
    md: {
      value: {
        fontFamily: 'heading',
        fontSize: 'xl',
        fontWeight: 'semibold',
        lineHeight: '1.3',
        letterSpacing: '-0.015em'
      }
    },
    sm: {
      value: {
        fontFamily: 'heading',
        fontSize: 'md',
        fontWeight: 'semibold',
        lineHeight: '1.4',
        letterSpacing: '-0.01em'
      }
    }
  },
  body: {
    value: {
      fontFamily: 'body',
      fontSize: 'md',
      lineHeight: '1.5'
    }
  },
  caption: {
    value: {
      fontFamily: 'body',
      fontSize: 'xs',
      lineHeight: '1rem',
      letterSpacing: '0.01em'
    }
  },
  /** Prices and percentages: tabular figures so columns line up. */
  numeric: {
    value: {
      fontVariantNumeric: 'tabular-nums'
    }
  }
});

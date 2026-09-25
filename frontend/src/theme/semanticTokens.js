import { defineSemanticTokens } from '@chakra-ui/react';

/**
 * Semantic tokens that resolve per color mode. Pages and components must use
 * these instead of `colorMode` ternaries.
 *
 * Names such as `bg`, `fg` and `border` already exist in Chakra's default
 * config; defining them here overrides their values (the configs are deeply
 * merged), so every Chakra component picks up the monochrome palette.
 */
export const semanticColors = defineSemanticTokens.colors({
  bg: {
    DEFAULT: {
      value: { _light: '{colors.neutral.25}', _dark: '{colors.neutral.975}' }
    },
    subtle: {
      value: { _light: '{colors.neutral.50}', _dark: '{colors.neutral.950}' }
    },
    muted: {
      value: { _light: '{colors.neutral.100}', _dark: '{colors.neutral.900}' }
    },
    emphasized: {
      value: { _light: '{colors.neutral.200}', _dark: '{colors.neutral.800}' }
    },
    // Chakra defaults these two to pure white/black; keep them off-white/off-black.
    panel: {
      value: { _light: '{colors.neutral.25}', _dark: '{colors.neutral.950}' }
    },
    inverted: {
      value: { _light: '{colors.neutral.975}', _dark: '{colors.neutral.25}' }
    }
  },
  fg: {
    DEFAULT: {
      value: { _light: '{colors.neutral.975}', _dark: '{colors.neutral.50}' }
    },
    muted: {
      value: { _light: '{colors.neutral.600}', _dark: '{colors.neutral.400}' }
    },
    // `550`, not `500`: on `bg.muted` in light mode `500` only reaches
    // 4.28:1 (below AA's 4.5:1 for normal text); `550` clears it with
    // margin on every surface this token is used against.
    subtle: {
      value: { _light: '{colors.neutral.550}', _dark: '{colors.neutral.450}' }
    },
    inverted: {
      value: { _light: '{colors.neutral.50}', _dark: '{colors.neutral.975}' }
    }
  },
  border: {
    DEFAULT: {
      value: { _light: '{colors.neutral.200}', _dark: '{colors.neutral.800}' }
    },
    emphasized: {
      value: { _light: '{colors.neutral.300}', _dark: '{colors.neutral.700}' }
    }
  },
  /** The accent is the foreground itself: near-black on light, near-white on dark. */
  accent: {
    DEFAULT: {
      value: { _light: '{colors.neutral.975}', _dark: '{colors.neutral.50}' }
    },
    /** Text and icons placed on an `accent` background. */
    fg: {
      value: { _light: '{colors.neutral.25}', _dark: '{colors.neutral.975}' }
    }
  },
  /** Price change direction. Always paired with a sign, never color alone. */
  price: {
    down: {
      value: {
        _light: '{colors.signal.green.600}',
        _dark: '{colors.signal.green.300}'
      }
    },
    up: {
      value: {
        _light: '{colors.signal.red.600}',
        _dark: '{colors.signal.red.300}'
      }
    },
    flat: {
      value: { _light: '{colors.neutral.600}', _dark: '{colors.neutral.400}' }
    }
  },
  /** Stock status. Always paired with text and an icon. */
  stock: {
    in: {
      value: {
        _light: '{colors.signal.green.600}',
        _dark: '{colors.signal.green.300}'
      }
    },
    out: {
      value: {
        _light: '{colors.signal.red.600}',
        _dark: '{colors.signal.red.300}'
      }
    }
  },
  /**
   * `gray` is the default color palette (set on `html` by Chakra's global
   * CSS). Point its solid/contrast pair at the accent so solid buttons,
   * checkboxes, switches and solid badges without an explicit
   * `colorPalette` are black and white, and give the focus ring AA non-text
   * contrast. Other palettes (e.g. `red` for destructive buttons) are kept.
   */
  gray: {
    solid: { value: '{colors.accent}' },
    contrast: { value: '{colors.accent.fg}' },
    focusRing: {
      value: { _light: '{colors.neutral.500}', _dark: '{colors.neutral.400}' }
    }
  }
});

/**
 * Semantic radii used by Chakra recipes (`l1`..`l3`). Remapped so inputs and
 * buttons (`l2`) are `md` and dialogs (`l3`) are `lg`.
 */
export const semanticRadii = defineSemanticTokens.radii({
  l1: { value: '{radii.sm}' },
  l2: { value: '{radii.md}' },
  l3: { value: '{radii.lg}' }
});

export const semanticTokens = { colors: semanticColors, radii: semanticRadii };

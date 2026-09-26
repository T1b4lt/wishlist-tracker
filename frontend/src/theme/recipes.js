import { defineRecipe, defineSlotRecipe } from '@chakra-ui/react';

/**
 * Partial recipe overrides. They are deep-merged into Chakra's default
 * recipes by `createSystem`, so only the changed parts are listed here. Slot
 * recipes omit `slots` on purpose: arrays are merged index by index, so a
 * partial list would overwrite the default slot names.
 */

/**
 * Button: pressing scales the button slightly for feedback; transitions and
 * the press scale are disabled when the user prefers reduced motion.
 *
 * The solid (default) variant keeps Chakra's `colorPalette.solid` /
 * `colorPalette.contrast` colors. The default `gray` palette maps those to
 * `accent` / `accent.fg` (see `semanticTokens.js`), so primary buttons are
 * near-black on light and near-white on dark, while an explicit
 * `colorPalette="red"` keeps destructive actions red.
 */
export const buttonRecipe = defineRecipe({
  base: {
    _active: { transform: 'scale(0.98)' },
    _motionReduce: {
      transition: 'none',
      _active: { transform: 'none' }
    }
  }
});

/** Badge: pill shaped. */
export const badgeRecipe = defineRecipe({
  base: { borderRadius: 'full' }
});

/**
 * Chakra's default `disabled` layer style (`opacity: 0.5` over the field's
 * normal `fg`/`bg`) fails WCAG AA on a form field: blending near-black `fg`
 * at 50% over `bg` measures ~3.74:1 in light mode (~5.05:1 in dark mode),
 * both below the 4.5:1 text minimum in at least one mode. Used below by
 * the input/textarea/select recipes instead of that layer style: an
 * explicit `fg.muted`-on-`bg.muted` pair (already used elsewhere for muted
 * text on a tinted surface) reaches 6.85:1 in light mode and 6.91:1 in dark
 * mode, comfortably clearing AA in both, while still reading as "disabled"
 * via the muted background instead of a blanket opacity.
 */
const disabledFieldStyle = {
  layerStyle: 'none',
  opacity: 1,
  cursor: 'not-allowed',
  bg: 'bg.muted',
  color: 'fg.muted'
};

/**
 * Input: disabled state keeps AA-contrast text (see `disabledFieldStyle`)
 * instead of Chakra's default 50%-opacity look.
 */
export const inputRecipe = defineRecipe({
  base: { _disabled: disabledFieldStyle }
});

/** Textarea: same disabled-contrast fix as `inputRecipe`. */
export const textareaRecipe = defineRecipe({
  base: { _disabled: disabledFieldStyle }
});

export const recipes = {
  button: buttonRecipe,
  badge: badgeRecipe,
  input: inputRecipe,
  textarea: textareaRecipe
};

/**
 * Card: radius `lg`. The border lives in the default `outline` variant
 * (bordered, no shadow), so `variant="elevated"` stays border-free.
 */
export const cardSlotRecipe = defineSlotRecipe({
  base: {
    root: { borderRadius: 'lg' }
  },
  variants: {
    variant: {
      outline: {
        root: { borderWidth: '1px', borderColor: 'border', boxShadow: 'none' }
      }
    }
  },
  defaultVariants: { variant: 'outline' }
});

/** Tag: pill shaped. */
export const tagSlotRecipe = defineSlotRecipe({
  base: {
    root: { borderRadius: 'full' }
  }
});

/**
 * Select: same disabled-contrast fix as `inputRecipe`, applied to the
 * trigger (the visible "field") and its label.
 */
export const selectSlotRecipe = defineSlotRecipe({
  base: {
    trigger: { _disabled: disabledFieldStyle },
    label: { _disabled: disabledFieldStyle }
  }
});

export const slotRecipes = {
  card: cardSlotRecipe,
  tag: tagSlotRecipe,
  select: selectSlotRecipe
};

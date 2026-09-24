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

export const recipes = {
  button: buttonRecipe,
  badge: badgeRecipe
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

export const slotRecipes = {
  card: cardSlotRecipe,
  tag: tagSlotRecipe
};

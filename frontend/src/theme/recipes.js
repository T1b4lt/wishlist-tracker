import { defineRecipe, defineSlotRecipe } from '@chakra-ui/react';

/**
 * Partial recipe overrides. They are deep-merged into Chakra's default
 * recipes by `createSystem`, so only the changed parts are listed here. Slot
 * recipes omit `slots` on purpose: arrays are merged index by index, so a
 * partial list would overwrite the default slot names.
 */

/**
 * Button: the solid (default) variant uses the accent, so primary actions
 * are near-black on light and near-white on dark. Pressing scales the button
 * slightly for feedback; transitions and the press scale are disabled when
 * the user prefers reduced motion.
 */
export const buttonRecipe = defineRecipe({
  base: {
    borderRadius: 'md',
    _active: { transform: 'scale(0.98)' },
    _motionReduce: {
      transition: 'none',
      _active: { transform: 'none' }
    }
  },
  variants: {
    variant: {
      solid: {
        bg: 'accent',
        color: 'accent.fg',
        _hover: { bg: 'accent/90' },
        _expanded: { bg: 'accent/90' }
      }
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

/** Card: radius `lg`, a border and no shadow by default. */
export const cardSlotRecipe = defineSlotRecipe({
  base: {
    root: {
      borderRadius: 'lg',
      borderWidth: '1px',
      borderColor: 'border',
      boxShadow: 'none'
    }
  }
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

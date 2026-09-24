import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import { globalCss } from './globalCss';
import { durations, easings } from './motion';
import { recipes, slotRecipes } from './recipes';
import { semanticTokens } from './semanticTokens';
import { textStyles } from './textStyles';
import { tokens } from './tokens';

/**
 * App theme: a monochrome black and white design on top of Chakra's default
 * config. Everything here is deep-merged into `defaultConfig`.
 */
export const config = defineConfig({
  globalCss,
  theme: {
    tokens: { ...tokens, durations, easings },
    semanticTokens,
    textStyles,
    recipes,
    slotRecipes
  }
});

export const system = createSystem(defaultConfig, config);

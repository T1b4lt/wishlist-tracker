# Frontend

## Testing

Unit and component tests use [Vitest](https://vitest.dev) with
[Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

```bash
npm test          # run the suite once
npm run test:watch  # re-run on file changes
```

Test files live next to the code they cover (`*.test.js` / `*.test.jsx`).
Shared test infrastructure lives in `src/test/`:

- `src/test/setup.js`: global test setup (jest-dom matchers, jsdom polyfills).
- `src/test/renderWithProviders.jsx`: renders a component wrapped in the
  Chakra UI provider and the i18n instance, for component tests.

## Theme

The Chakra UI v3 theme lives in `src/theme/` and is exported as `system`
(consumed by `src/components/ui/provider.jsx`):

- `tokens.js`: fonts (Geist and Geist Mono, self-hosted through the
  `@fontsource-variable/*` packages imported in `src/main.jsx`), radii and
  the raw `neutral` and `signal` color scales.
- `semanticTokens.js`: per color mode tokens (`bg`, `fg`, `border`,
  `accent`, `price.*`, `stock.*`, ...). Use these instead of raw colors or
  `colorMode` ternaries.
- `textStyles.js`: `display`, `heading.lg|md|sm`, `body`, `caption` and
  `numeric` (tabular figures for prices and percentages).
- `recipes.js`: overrides for Chakra recipes (button press feedback, flat
  bordered cards, pill badges and tags). Solid buttons use the default
  `gray` palette, which maps to `accent`, so they are black and white;
  `colorPalette="red"` keeps destructive actions red.
- `globalCss.js`: body colors, the `:focus-visible` outline and the
  `prefers-reduced-motion` override.

Shape rule: cards and dialogs `lg` (12px), inputs and buttons `md` (8px),
tags and badges `full`.

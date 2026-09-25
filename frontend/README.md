# Frontend

React 19 + Vite, [Chakra UI v3](https://www.chakra-ui.com/) (the only design
system), [`wouter`](https://github.com/molefrog/wouter) for routing,
[`react-i18next`](https://react.i18next.com/) for i18n, [Zustand](https://zustand.docs.pmnd.rs)
for state and [`motion`](https://motion.dev/) (Framer Motion) for animation.
Icons are [Lucide](https://lucide.dev/) only, via `react-icons/lu`.

## Commands

Run from this directory (`frontend/`):

```bash
npm run dev            # start the Vite dev server
npm run build           # production build (outputs to dist/)
npm run preview         # preview a production build locally
npm test                # run the Vitest suite once
npm run test:watch      # re-run on file changes
npm run lint             # eslint . (--max-warnings=0 in CI/pre-commit)
npm run format           # prettier --write .
npm run format:check    # prettier --check .
```

## Structure

```
src/
  components/   Reusable UI, grouped by feature (see "Components" below)
  hooks/        Shared hooks (useDocumentTitle, useUnsavedChangesGuard)
  i18n/         english.json / spanish.json + the i18next instance
  lib/          API client, formatting and other framework-free helpers
  pages/        One component per route, wired to stores and components
  stores/       Zustand stores (server state)
  test/         Shared test setup and render helpers
  theme/        The Chakra v3 theme (tokens, semantic tokens, recipes, motion)
```

## Components

- `components/layout/`: `AppShell` (header, footer, page transition),
  `AppHeader`/`AppFooter`, `PageContainer` (shared max width/padding) and
  `PageHeader` (title, optional description, actions and back link).
- `components/common/`: shared, page-agnostic pieces used across features:
  `EmptyState`, `ErrorState`, `LoadingState`, `SkeletonRows`/`SkeletonCards`,
  `ConfirmDialog`, `CategoryTag`, `CategoryColorPicker`, `PriorityBadge`,
  `PriceChange`, `StockStatus`.
- `components/dashboard/`, `components/product/`, `components/products/`,
  `components/categories/`, `components/settings/`: page-specific pieces
  (e.g. `ProductTable`/`ProductCardList`, `ProductFormDialog`,
  `CategoryFormDialog`, `SaveBar`, `TelegramSetup`).
- `components/motion/`: shared animation presets built on `motion/react`
  (`FadeIn`, `Stagger`/`StaggerItem`, `AnimatedList`/`AnimatedListItem`,
  `PageTransition`), each honoring `prefers-reduced-motion` via
  `useReducedMotion`.
- `components/ui/`: Chakra UI v3 component snippets (`dialog`, `drawer`,
  `select`, `combobox`, `field`, `tag`, `tooltip`, `toaster`, `color-mode`,
  ...), the low-level building blocks every other component composes.

## lib

Framework-free helpers under `src/lib/`:

- `lib/api/`: a small fetch-based client (`client.js`) plus one module per
  resource (`products.js`, `categories.js`, `config.js`, `telegram.js`),
  re-exported from `lib/api/index.js`.
- `lib/format.js`: locale-aware price/date/relative-time formatting.
- `lib/dashboardSummary.js`, `lib/productHistory.js`: pure functions the
  dashboard and product pages use to derive totals, chart points and stats
  from store data.
- `lib/settingsDraft.js`: the Settings page's dirty/merge logic (draft vs.
  saved config).
- `lib/categoryColors.js`, `lib/priorityVisuals.js`, `lib/web_utils.js`:
  small, focused helpers (category swatch palette, priority icon/weight
  maps, currency codes).

## Accessibility and motion

- Every icon-only button has an `aria-label`; disabled-but-explanatory
  controls (e.g. a blocked category delete) use `aria-disabled` instead of
  the native `disabled` attribute, so they stay focusable and their tooltip
  reachable by keyboard.
- Dialogs opened from a menu item pass `finalFocusEl` back to the menu's own
  trigger (the `Menu.Item` that was clicked unmounts as soon as the menu
  closes, so a dialog cannot rely on "restore focus to whatever was focused"
  in that case).
- A live announcement (e.g. `SaveBar`'s "unsaved changes") is rendered on a
  region that stays mounted, never one that mounts/unmounts with the state
  it announces: assistive tech needs the region present before its content
  changes.
- Every animation goes through `components/motion/` or the presets in
  `theme/motion.js`, respects `prefers-reduced-motion` (both the CSS media
  query, in `theme/globalCss.js`, and Motion's `useReducedMotion`), and
  animates only `transform`/`opacity` (plus `height` for list exits).

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

## State

Server state (products, categories, config) lives in [Zustand](https://zustand.docs.pmnd.rs)
stores under `src/stores/` (one file per store, tests beside them):

- `productsStore.js`: dashboard summary `items` and per-product `details`
  (keyed by id), with `fetchSummary`, `create`, `update`, `remove` and
  `fetchDetail` actions. Mutations refetch the summary on success.
  `fetchDetail` keeps a product's previously-loaded `data` in place while
  re-fetching (only `status` flips to `'loading'`), so the product page
  shows a loading skeleton only on the very first load, not on every
  revisit.
- `categoriesStore.js`: the categories `items` list, with `fetch`, `create`,
  `update` and `remove` actions.
- `configStore.js`: the application `config`, with `fetch(force)` and
  `save(patch)`. This is the single source of truth for the UI language:
  every successful `fetch()`/`save()` applies `config.selected_language`
  via i18next and persists it, so pages can all call `fetch()` on mount and
  only the first one actually hits the network.

Each store exposes `status` (`'idle' | 'loading' | 'success' | 'error'`) and
`error` alongside its data, backed by the API modules in `src/lib/api/`.
Pages render `ErrorState`/`EmptyState`/skeletons/`ConfirmDialog` from
`src/components/common/` off that state instead of calling `fetch` directly.

## i18n

Every user-visible string goes through `react-i18next`, with a flat-key
JSON file per locale in `src/i18n/` (`english.json`, `spanish.json`). Both
files must define the exact same set of keys (checked by
`src/i18n/locales.test.js`, which also fails on an em dash or en dash in
any value); a key can be referenced dynamically (e.g.
``t(`pages.settings.telegram.status.${status}`)`` or an i18next
pluralization suffix like `_one`/`_other`), so check actual usage carefully
before adding or removing one.

## Theme

The Chakra UI v3 theme lives in `src/theme/` and is exported as `system`
(consumed by `src/components/ui/provider.jsx`):

- `tokens.js`: fonts (Geist and Geist Mono, self-hosted through the
  `@fontsource-variable/*` packages imported in `src/main.jsx`), radii and
  the raw `neutral` and `signal` color scales. `neutral.550` sits between
  `500` and `600`: it exists only so `fg.subtle` can clear WCAG AA (4.5:1)
  on a tinted (`bg.muted`) surface, not just the plain `bg`.
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
tags and badges `full`. Borders and background tints come before shadows;
shadows are reserved for floating layers (menus, dialogs, toasts), so
regular cards never set their own `shadow`/`boxShadow`.

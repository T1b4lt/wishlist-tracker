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
npm run test:e2e        # run the Playwright e2e suite (see Testing below)
npm run lint             # eslint . (--max-warnings=0 in CI/pre-commit)
npm run format           # prettier --write .
npm run format:check    # prettier --check .
```

## Structure

```
e2e/            Playwright end-to-end smoke tests and visual snapshots
                (fixtures/, support/, visual.spec.js-snapshots/)
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

- `components/layout/`: `AppShell` (header, footer, page transition,
  scroll reset after each route change, app-wide config load),
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
`vite.config.js` pins `TZ=UTC` for Vitest, so every unit test is
timezone-independent (the suite passes the same under, e.g.,
`TZ=America/Los_Angeles npm test` or `TZ=Pacific/Kiritimati npm test`).
The unit suite also runs on `git push` through the pre-commit `pre-push`
hook (see "Git Hooks" in the root README).
Shared test infrastructure lives in `src/test/`:

- `src/test/setup.js`: global test setup (jest-dom matchers, jsdom polyfills).
- `src/test/renderWithProviders.jsx`: renders a component wrapped in the
  Chakra UI provider and the i18n instance, for component tests.

### End-to-end tests (Playwright)

Smoke tests under `e2e/` drive the real app in Chromium against a Vite dev
server, with every backend call mocked via `page.route` (`e2e/support/apiMock.js`)
against fixtures in `e2e/fixtures/`: no backend process is started, and any
API call the fixtures don't cover fails loudly (a `500` plus a `console.error`
in the test output) instead of silently falling through. `playwright.config.js`
starts its own dev server on a dedicated port, pins `timezoneId`/`locale` to
`UTC`/`en-US` for stable date assertions, and runs two projects: `desktop`
(1440x900) and `mobile` (390x844, touch-enabled). Motion is reduced by
default for stability; `e2e/navigation.spec.js` opts back into real motion to
smoke-test the route-change page transition.

```bash
npx playwright install chromium  # once, to download the browser
npm run test:e2e                 # run the whole e2e suite (both projects)
npx playwright test dashboard.spec.js --project=desktop  # a single file/project
npx playwright show-report       # open the HTML report from the last run
```

### Visual snapshots

`e2e/visual.spec.js` captures every page (dashboard, product detail,
categories, settings, 404) in light and dark mode on both projects
(`desktop` and `mobile`) with Playwright's `toHaveScreenshot`, compared
against the baselines committed in `e2e/visual.spec.js-snapshots/` with a
small tolerance (`maxDiffPixelRatio: 0.01`, in `playwright.config.js`). The
API is mocked with fixed fixtures and "now" is frozen on both sides (fixture
builders via `pinFixtureNow` in `e2e/fixtures/time.js`, the browser via
`page.clock.setFixedTime`), so dates and relative times never drift.

After an intended visual change, review the diff images Playwright writes
to `test-results/`, then regenerate the baselines and commit them:

```bash
npx playwright test --update-snapshots                 # all specs
npx playwright test visual.spec.js --update-snapshots  # snapshots only
```

Baselines are platform-specific: fonts and anti-aliasing differ between
operating systems, so the file names carry a platform suffix (e.g.
`dashboard-light-desktop-linux.png`). They were generated on Linux; running
the suite on another OS needs its own baselines (generate them with the
command above, locally, and do not overwrite the Linux ones).

Vitest ignores `e2e/**` (`vite.config.js`'s `test.exclude`), and ESLint gives
that directory Node + browser globals (`playwright.config.js` runs in Node;
`page.evaluate`/`page.route` callbacks run in the browser or read the
request), since it is otherwise treated like the rest of the source tree.

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
  via i18next and persists it. `AppShell` calls `fetch()` once at app load,
  so the saved language applies on every route (including Categories and
  the 404 page); pages that read the config also call `fetch()` on mount,
  which stays a no-op once it is loaded or in flight, so they keep working
  when rendered on their own (e.g. in tests).

Each store exposes `status` (`'idle' | 'loading' | 'success' | 'error'`) and
`error` alongside its data, backed by the API modules in `src/lib/api/`.
Pages treat `'idle'` (before their first fetch has started) like
`'loading'`, so an empty state never flashes before the data arrives.
Pages render `ErrorState`/`EmptyState`/skeletons/`ConfirmDialog` from
`src/components/common/` off that state instead of calling `fetch` directly.

## i18n

Every user-visible string goes through `react-i18next`, with a nested JSON
file per locale in `src/i18n/` (`english.json`, `spanish.json`), referenced
by dot path (e.g. `t('pages.dashboard.title')`). Both files must define the
exact same set of keys (checked by `src/i18n/locales.test.js`, which
flattens both files to dot paths and compares them, which also fails on an em dash or en dash in
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
  bordered cards, pill badges and tags, the icon size scale and stroke
  width, see "Icons" below). Solid buttons use the default
  `gray` palette, which maps to `accent`, so they are black and white;
  `colorPalette="red"` keeps destructive actions red.
- `globalCss.js`: body colors, the `:focus-visible` outline and the
  `prefers-reduced-motion` override.

Shape rule: cards and dialogs `lg` (12px), inputs and buttons `md` (8px),
tags and badges `full`. Borders and background tints come before shadows;
shadows are reserved for floating layers (menus, dialogs, toasts), so
regular cards never set their own `shadow`/`boxShadow`.

## Icons

Icons are Lucide only (`react-icons/lu`), always rendered through Chakra's
`Icon` with the `as` prop, never as a bare `<LuX size={20} />`:

```jsx
import { Icon } from '@chakra-ui/react';
import { LuPencil } from 'react-icons/lu';

<Icon as={LuPencil} size="md" />;
```

The size scale and the stroke width are defined once, in the `icon` recipe
in `src/theme/recipes.js` (`ICON_STROKE_WIDTH`, Lucide's own `2`):

| `size` | px  | Typical use                                        |
| ------ | --- | -------------------------------------------------- |
| `xs`   | 12  | inside small badges (priority, Telegram status)    |
| `sm`   | 14  | inline with body text (price change, stock, links) |
| `md`   | 16  | menu items                                         |
| `lg`   | 20  | standalone header and section icons                |
| `xl`   | 24  | empty and error state illustrations                |

Inside a `Button` or `IconButton`, omit `size`: the button recipe sizes its
icons to match the button's own size. `Icon` is `aria-hidden` by default,
so an icon-only button still needs its own `aria-label`.

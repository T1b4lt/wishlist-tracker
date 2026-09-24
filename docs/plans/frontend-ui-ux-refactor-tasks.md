# Frontend UI/UX Refactor: Execution Plan

Spec: `docs/plans/frontend-ui-ux-refactor.md` (the roadmap). If this plan and
the spec disagree, the spec wins. Section references such as "spec §2.1" point
into that file.

Branch: `refactor/frontend-ui-ux`. Tasks run in order. Each task leaves the
app building, linted and with passing tests, and ends with one or more
Conventional Commits.

## Global Constraints

These apply to every task.

- **Language:** code, comments, docs, commit messages and test names in
  English. Every user-visible string goes through i18next and exists in
  **both** `frontend/src/i18n/english.json` and `frontend/src/i18n/spanish.json`
  (Spanish translated properly, with accents).
- **Stack:** React 19 + Vite + **Chakra UI v3** (the only design system; do not
  add another component library) + `wouter` + `react-i18next` + recharts or
  `@chakra-ui/charts`. Icons: **Lucide only**, from `react-icons/lu`.
  State: **Zustand** (no TanStack Query, no Redux). Animation: **`motion`**
  (Framer Motion) only. Fonts: **Fontsource**
  packages `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`.
- **Visual style: modern black and white.** Monochrome neutral scale, off-black
  and off-white (never pure `#000` / `#fff`). The primary action color is the
  foreground (near-black on light, near-white on dark). No brand hue, no
  gradients, no glows, no gradient text, no emoji in UI copy. Color is used
  only for data semantics through semantic tokens (`price.down` muted green,
  `price.up` muted red, `price.flat`, `stock.in`, `stock.out`). Priority is
  shown with weight and icon, not traffic-light hues. Category colors appear
  only as small swatches or dots.
- **Shape rule:** cards and dialogs radius `lg` (12px), inputs and buttons
  `md` (8px), tags and badges `full`. Borders and background tints before
  shadows; shadows only on floating layers (menus, dialogs, toasts).
- **Motion:** the app should feel alive but calm. Use the **`motion`**
  package (Framer Motion, `motion/react`) through the presets from Task 6
  together with Chakra's built-in animations. Every animation must have a
  purpose (feedback, state change, entering or leaving content, hierarchy);
  no infinite decorative loops. Only animate `transform` and `opacity` (height
  for list exits). Everything respects `prefers-reduced-motion` (Motion's
  `useReducedMotion` / `MotionConfig reducedMotion="user"` and the CSS media
  query). Page tasks from Task 10 on must apply the motion listed for them in
  Task 6.
- **Theming:** no `colorMode === 'light' ? a : b` ternaries for styling once
  Task 4 lands. Use semantic tokens (`bg`, `fg`, `border`, etc.) that resolve
  per mode. `useColorMode` is only for the toggle.
- **No em-dash (`—`) or en-dash (`–`) in any user-visible string.** Use a
  hyphen, a period or a comma.
- **Accessibility:** every icon-only button has an `aria-label`, visible
  `:focus-visible` rings, color is never the only signal (price change shows a
  sign, stock shows text), WCAG AA contrast in both modes.
- **Responsive:** every layout must work at 360px, 390px, 768px, 1024px and
  1440px with no horizontal page scroll.
- **Out of scope:** dashboard search, filters and sorting. Do not implement
  them.
- **Commands** (run from repo root unless noted):
  - Frontend lint and format check: `cd frontend && npm run lint && npm run format:check`
  - Frontend build: `cd frontend && npm run build`
  - Frontend unit tests (from Task 1): `cd frontend && npm test`
  - Backend lint: `cd backend && uv run ruff check . && uv run ruff format --check .`
  - Backend tests (from Task 1): `cd backend && uv run pytest`
- **Pre-commit hooks** run prettier, eslint (`--max-warnings=0`), ruff and a
  Conventional Commit check. If a hook modifies files, re-stage and commit
  again. Never use `--no-verify`.
- **Never touch** `backend/db/database.db` (the user's real data). Backend
  tests use a temporary or in-memory SQLite database.
- **Docs:** keep `README.md`, `frontend/README.md` and `backend/README.md` up
  to date when commands, dependencies or structure change.

---

### Task 1: Test infrastructure (frontend and backend)

Goal: every later task can write tests.

Frontend:

- Add dev dependencies: `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- Configure Vitest in `frontend/vite.config.js` (`test.environment: 'jsdom'`,
  `test.setupFiles: './src/test/setup.js'`, `globals: true`) and make the `@`
  alias work in tests (use an absolute path from `fileURLToPath`).
- `src/test/setup.js` imports `@testing-library/jest-dom/vitest`.
- `src/test/renderWithProviders.jsx`: renders a component inside Chakra
  `Provider` and the i18n instance, for component tests.
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- One real test to prove the setup: unit tests for the existing
  `getCurrencySymbol` and `getPriorityLabel` in `src/lib/web_utils.js`.
- ESLint must accept test files (add `globals.vitest` or the Vitest globals
  for `**/*.test.{js,jsx}` and `src/test/**`).

Backend:

- Add dev dependencies `pytest` and `httpx` with `uv add --dev`.
- `backend/tests/conftest.py`: a fixture that builds an in-memory SQLite engine
  (`sqlite://` with `StaticPool`, foreign keys ON), creates all tables, and
  overrides the FastAPI `get_session` dependency; plus a `client` fixture
  (`fastapi.testclient.TestClient`). The app lifespan checks for
  `db/database.db`; tests must not depend on that file (for example, build the
  client without running the lifespan, or patch the check).
- One smoke test file `backend/tests/test_categories.py` covering create, list
  and delete of a category.
- `[tool.pytest.ini_options]` in `pyproject.toml` (`testpaths = ["tests"]`,
  `pythonpath = ["."]`).

Tooling:

- `justfile`: add `test` (runs both), `test-frontend`, `test-backend` recipes
  in a `test` group.
- Add `.playwright-cli/` and `.superpowers/` to the root `.gitignore`.
- Update READMEs with the test commands.

Acceptance: `npm test`, `uv run pytest`, `just test` all pass; lint passes.

### Task 2: Hotfixes (spec §2.1, B1-B9)

Minimal, targeted fixes. Later tasks will rebuild these screens, so do not
redesign anything here.

- **B1/B2:** the Chakra v2 `bgGradient="to-r, a, b"` strings in
  `DashboardPage.jsx` and `ProductPage.jsx` render no background, so white
  text disappears on white. Replace those gradient boxes with a solid,
  token-based surface (for example `bg="gray.900"` with `color="white"`, and
  `_dark` equivalent) so title and subtitle are readable in both modes.
- **B3:** make the dashboard table scroll horizontally inside its card
  (`Table.ScrollArea` or `overflowX="auto"`), so every column, including
  Delete, is reachable at 390px.
- **B4:** Settings must not change the app language on load and must not
  apply the language when the select changes. The language is applied and
  persisted to `localStorage` only after a successful Save. On app start, the
  language comes from `localStorage` (as today); after Settings loads, do not
  override it silently.
- **B5:** translate the hardcoded "Average Price" label
  (`pages.product.price.average`, both locales).
- **B6:** a price change of exactly `0` is "flat" (`LuMinus`, gray), not a
  drop. Apply to Product page and Dashboard.
- **B7:** when the dashboard or product fetch fails, show an error message
  with a Retry button instead of the empty state (add i18n keys).
- **B8:** mask the Telegram bot token input (`type="password"`) with a
  show/hide toggle button (`aria-label`, both locales).
- **B9:** remove the React warning "Encountered a script tag while rendering
  React component" coming from `next-themes` in
  `src/components/ui/color-mode.jsx`. Check the installed `next-themes`
  version and its docs for React 19; if no clean fix exists, document why in a
  code comment and leave it.
- Add unit tests for the trend logic you touch (extract it into a small pure
  function in `src/lib/` if needed).

Acceptance: all listed bugs fixed; tests and lint pass.

### Task 3: Theme foundation and fonts (spec §3, Phase 1)

- Install `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`;
  import them in `src/main.jsx`.
- Replace `src/theme.js` with a `src/theme/` folder (`index.js` exporting
  `system`, plus `tokens.js`, `semanticTokens.js`, `textStyles.js`,
  `recipes.js` as needed) built with `createSystem(defaultConfig, config)`:
  - `fonts`: `heading` and `body` = `'Geist Variable', system-ui, sans-serif`;
    `mono` = `'Geist Mono Variable', ui-monospace, monospace`. Remove every
    `Inter` reference.
  - A monochrome neutral palette (off-black to off-white) plus muted `green`
    and `red` values for data semantics.
  - `semanticTokens.colors` with `_light` / `_dark` values: `bg`,
    `bg.subtle`, `bg.muted`, `bg.emphasized`, `fg`, `fg.muted`, `fg.subtle`,
    `border`, `border.emphasized`, `accent` (= foreground), `accent.fg`
    (text on accent), `price.down`, `price.up`, `price.flat`, `stock.in`,
    `stock.out`. Where Chakra already defines a semantic token with the same
    name, override its values instead of creating a clash.
  - Radii per the shape rule; `textStyles`: `display`, `heading.lg`,
    `heading.md`, `heading.sm`, `body`, `caption`, `numeric` (numeric uses
    `fontVariantNumeric: 'tabular-nums'`).
  - Button recipe: default solid variant uses `accent` / `accent.fg`, press
    feedback `scale(0.98)`, transitions disabled under reduced motion. Card
    recipe: radius `lg`, border, no shadow by default. Badge/Tag: radius
    `full`.
- Global CSS (via `globalCss` in the system): body uses `bg` / `fg`, a visible
  `:focus-visible` outline, and `@media (prefers-reduced-motion: reduce)` that
  disables transitions and animations.
- Add a unit test that imports `system` and asserts the key semantic tokens
  and fonts exist (for example with `system.token('colors.fg')` or by
  checking the config object).

Acceptance: the app renders in Geist in both modes, buttons are black/white,
build, tests and lint pass. Page-level ternaries are still allowed in this
task (Task 4 removes them).

### Task 4: Remove color-mode ternaries

- Replace every `colorMode === 'light' ? X : Y` (and similar) used for
  styling in `src/pages/**` and `src/components/**` (excluding the
  Chakra snippet files in `src/components/ui/**` unless they contain such
  ternaries) with semantic tokens from Task 3, or with `_dark` props where a
  token does not fit.
- Remove hardcoded colors (`rgba(...)`, hex values, `blue.600`, `purple.*`,
  `whiteAlpha.*`) from pages and components, except the category colors that
  come from data. The chart colors in `ProductPage.jsx` must read theme tokens
  (for example with `useToken` or CSS variables `var(--chakra-colors-...)`).
- After this task `grep -rn "colorMode ===" frontend/src --include=*.jsx`
  returns only the theme toggle in the header.
- Keep behavior and layout identical apart from the colors.

Acceptance: grep is clean, visual check in both modes, build, tests and lint
pass.

### Task 5: Layout shell, navigation and page headers (spec §2.2, Phase 1)

- `src/components/layout/AppShell.jsx`: `minH="100dvh"` flex or grid column
  with header, `main` (grows) and footer, so the footer sits at the bottom on
  short pages.
- `src/components/layout/AppHeader.jsx` (replaces `HeaderComponent.jsx`):
  brand text on the left; from `md` up, an inline nav with the three routes
  (Dashboard `/`, Categories `/categories`, Settings `/settings`) with a clear
  active state (`aria-current="page"`); theme toggle on the right. Below `md`,
  a menu button opens the existing drawer navigation. Header height 56-64px,
  sticky, `bg` with a bottom border (no blur needed).
- `src/components/layout/AppFooter.jsx` (replaces `FooterComponent.jsx`),
  styled with tokens.
- `src/components/layout/PageContainer.jsx`: one max width (`7xl`) and one
  horizontal padding scale (`px={{ base: 4, md: 6 }}`, `py={{ base: 6, md: 8 }}`).
- `src/components/layout/PageHeader.jsx`: props `title`, optional
  `description`, optional `actions` (node), optional `backLink`. Title uses
  `textStyle="heading.lg"`. Stacks on mobile, row on `md+`.
- `src/hooks/useDocumentTitle.js`: sets `document.title` to
  `"<page title> | Wishlist Tracker"` and restores on unmount. Use it on every
  page. Update `index.html` `<title>` to `Wishlist Tracker`, and change
  `common.appName` to "Wishlist Tracker" in both locales.
- Apply `PageContainer` and `PageHeader` to Dashboard, Categories, Settings,
  Product and 404. On the Dashboard, the "Add New Product" button moves into
  the `PageHeader` actions and the banner box is removed. On Categories, the
  "Add Category" button moves into the `PageHeader` actions and the "Add New
  Category" card is removed. Do not redesign page bodies yet.
- Component tests: `AppHeader` marks the current route with
  `aria-current="page"`; `PageHeader` renders title, description and actions.

Acceptance: nav visible on desktop with active state, footer pinned, all pages
use the shared header and container, tests and lint pass.

### Task 6: Motion foundation (Motion + Chakra)

Goal: a small, reusable motion layer so every later page task can animate in
a consistent way.

- Add the `motion` package (the current name of Framer Motion, same API;
  import from `motion/react`). Do not add GSAP or any other animation
  library.
- `src/theme/motion.js` (or inside the theme): shared durations
  (`fast` 150ms, `normal` 220ms, `slow` 350ms), easings (`easeOut`
  `[0.16, 1, 0.3, 1]`) and a spring (`{ type: 'spring', stiffness: 400,
damping: 32 }`). Also expose them as Chakra tokens (`durations`,
  `easings`) so CSS transitions and Motion use the same values.
- Chakra integration: create Motion-enabled Chakra components with
  `motion.create(Box)` / `chakra(motion.div)` (whichever works with Chakra v3
  without prop warnings), exported from `src/components/motion/`:
  `MotionBox`, `MotionFlex`, and presets:
  - `FadeIn` (opacity + 8px y offset on mount),
  - `Stagger` + `StaggerItem` (children enter with `staggerChildren` ~0.04s),
  - `AnimatedList` wrapping `AnimatePresence` for items that are added or
    removed (exit: fade + collapse height, `layout` for siblings),
  - `PageTransition` (fade + 6px y on route change).
- Route transitions: wrap the router outlet in `AppShell` with
  `AnimatePresence mode="wait"` keyed by location, using `PageTransition`.
- Reduced motion: every preset uses `useReducedMotion()` and renders without
  movement (instant opacity, no transforms) when it is true. Wrap the app in
  `<MotionConfig reducedMotion="user">`.
- Only animate `transform` and `opacity` (plus height for list exits).
- Tests: a component test that `FadeIn` renders its children; a test that
  presets skip movement when reduced motion is on (mock `useReducedMotion`).

Motion to apply in later tasks (each page task owns its part, using these
presets):

- Dashboard: summary values fade/count in once on load; rows or cards enter
  with `Stagger`; deleting a product animates its row out with `AnimatedList`;
  row hover shows a subtle background transition; sparklines draw in.
- Product dialog: fields fade in after extraction (skeleton to content).
- Product detail: header and stats `FadeIn`; chart line draws in (recharts
  `isAnimationActive` with the shared duration, disabled under reduced
  motion); range changes animate the line; description expand/collapse
  animates height.
- Categories: cards enter with `Stagger`, add/delete animate with
  `AnimatedList`; color swatch selection scales slightly.
- Settings: the sticky save bar slides up and fades in when the form becomes
  dirty and slides out when saved or discarded; Telegram step status changes
  cross-fade.
- Global: page transitions, toasts and dialogs use Chakra's built-in
  animations with the shared durations; buttons press with `scale(0.98)`.

Acceptance: route changes animate, presets exist and are tested, reduced
motion disables movement, tests and lint pass.

### Task 7: API client, formatting helpers and shared state components (spec Phase 2)

- `src/lib/api/client.js`: `request(path, { method, body, signal })` using
  `API_URL`, JSON in/out, throws an `ApiError` (`status`, `detail`, `message`)
  for non-2xx responses (read `detail` from the JSON body when present).
- Resource modules: `src/lib/api/products.js` (`list`, `dashboardSummary`,
  `get`, `create`, `update`, `remove`, `extractInfo`),
  `categories.js` (`list`, `create`, `update`, `remove`),
  `config.js` (`get`, `update`), `telegram.js` (`getChatId`,
  `sendTestMessage`).
- `src/lib/format.js`: `getLocale(language)` (`spanish` → `es-ES`, else
  `en-US`), `formatPrice(value, currency, locale)`,
  `formatPercent(value, locale, { signDisplay })` (input is a percentage
  number such as `-3.2`), `formatDate(ts, locale, style)`,
  `formatRelative(ts, locale, now?)` via `Intl.RelativeTimeFormat`,
  `getTrend(value)` returning `'down' | 'up' | 'flat' | null` (null/undefined
  → null, 0 → flat). Move or replace the Task 2 trend helper and the
  duplicated helpers from pages; keep `getCurrencySymbol` and
  `getPriorityLabel` working.
- Shared components in `src/components/common/`: `EmptyState` (icon, title,
  description, action), `ErrorState` (title, message, `onRetry`),
  `LoadingState` / skeleton helpers (`SkeletonRows`, `SkeletonCards`),
  `ConfirmDialog` (title, body, confirm label, destructive flag, `onConfirm`,
  loading state), `PriorityBadge` (weight + Lucide icon per priority, no
  traffic-light colors), `CategoryTag` (small color dot + name, readable in
  both modes), `PriceChange` (sign + icon + color from `price.*` tokens,
  uses `formatPercent`), `StockStatus` (icon + text).
- Unit tests for `client.js` (mock `fetch`), every `format.js` function and
  the components' key behavior (`PriceChange` renders a sign, `ConfirmDialog`
  calls `onConfirm`).
- Do not migrate the pages yet (Task 9 does it), apart from removing helpers
  that you moved if that is trivial.

Acceptance: helpers and components tested, lint passes.

### Task 8: Backend additions (spec §5)

Keep every existing response field; only add fields. Add tests in
`backend/tests/` for each change.

- `ProductDashboardSummary`: add `recent_prices: list[float]` (prices of the
  last N history records in chronological order, N = the configured
  `hist_window_size`, capped at 60 points) and `last_checked_at: int | None`
  (timestamp of the newest history record).
- `ProductDetailResponse`: add `last_checked_at: int | None`.
- `ProductUpdate`: add `description: str | None = None` so the edit form can
  update it; make sure the service applies it.
- Categories: `GET /categories/` returns each category with
  `product_count: int` (use a response schema; the create/update responses may
  stay as they are or include the count, be consistent and document it).
- `ConfigResponse`: add `telegram_status: str` with values
  `"not_configured"` (no token), `"token_only"` (token, no chat id) and
  `"connected"` (token and chat id). Compute it in the service; it is not
  stored.
- Update `backend/README.md` if it documents these endpoints.
- Out of scope: the optional "check now" refresh endpoint.

Acceptance: `uv run pytest` passes with tests for every new field; ruff
passes.

### Task 9: Zustand stores and page migration (spec Phase 2)

- Add `zustand`.
- `src/stores/productsStore.js`, `categoriesStore.js`, `configStore.js`.
  Each store holds `status` (`'idle' | 'loading' | 'success' | 'error'`),
  `error`, its data, and async actions that use the Task 7 API modules:
  - products: `items` (dashboard summary), `fetchSummary()`,
    `create(data)`, `update(id, data)`, `remove(id)`; after a mutation it
    refetches the summary. Product detail: `details` keyed by id with
    `fetchDetail(id)`.
  - categories: `items`, `fetch()`, `create`, `update`, `remove`; `remove`
    surfaces the backend 400 ("category in use") as a typed error.
  - config: `config`, `fetch()` (skips the request if already loaded unless
    `force`), `save(patch)`. The config store is the single source of truth
    for the language: after `fetch()` or `save()`, it applies
    `config.selected_language` with `i18n.changeLanguage` and persists it to
    `localStorage` (keep the `localStorage` value as the initial language
    before the config loads, to avoid a flash).
- A tiny `useLoadOnMount`-style pattern (or calling the store action from an
  effect) so pages trigger fetches without duplicating logic; keep the
  `react-hooks` ESLint rules happy without `eslint-disable` comments.
- Migrate Dashboard, Product, Categories, Settings, `NewProductModal` and
  `CategoryModal` to the stores and API modules. No page calls `fetch`
  directly anymore. `/config/` is requested once per app load.
- Use `ErrorState`, `EmptyState`, skeletons and `ConfirmDialog` from Task 7 in
  the migrated pages (replace `DeleteProductDialog` and the inline category
  delete dialog with `ConfirmDialog`).
- Feedback rule: toasts for mutation results (create, update, delete, save),
  inline messages for validation.
- Store unit tests with the API modules mocked (status transitions, refetch
  after mutation, language applied on config load).

Acceptance: `grep -rnE "(^|[^.A-Za-z_])fetch\(" frontend/src/pages frontend/src/components`
(global `fetch` calls, not store actions)
returns nothing; tests and lint pass; manual check that every page loads.

### Task 10: Dashboard redesign (spec §2.4, Phase 3)

- Layout: `PageHeader` ("Wishlist" title, "Add product" primary action), a
  summary strip, then the product list. Leave visual room for a future
  toolbar but do not build search, filters or sort.
- Summary strip (plain stats, no card per stat, `textStyle="numeric"` for
  values): item count; total current value (group by currency, show each
  currency total); number of products whose `price_change_60d` is below 0
  ("price drops"); number of products whose current price equals the minimum
  of `recent_prices` ("at lowest"). Hide stats that cannot be computed.
- `md+`: a table with columns name (with `CategoryTag` below or beside it),
  priority (`PriorityBadge`), trend (sparkline from `recent_prices`, a tiny
  recharts `LineChart` without axes, ~96x28px, stroke `fg.muted`), price
  (`numeric`), change (`PriceChange`), stock (`StockStatus`), and a row
  actions menu (Lucide `LuEllipsis`, Chakra `Menu`): Open, Edit, Open store
  page, Delete. The whole row navigates to the detail page on click and on
  Enter (keyboard accessible); clicks inside the menu do not navigate.
- `<md`: a list of cards (name, category, price with change, stock, actions
  menu); tapping the card opens the detail page. No horizontal scroll.
- Edit opens the product dialog in edit mode (Task 11 builds the shared form;
  in this task wire the menu item to a callback that Task 11 will complete, or
  open the existing modal if it already supports editing). Delete uses
  `ConfirmDialog` and shows a toast.
- Empty state with `EmptyState` and the "Add product" action. Skeleton rows
  while loading, `ErrorState` on failure.
- Component tests: summary computations (extract them into a pure function
  in `src/lib/` and unit test it), row click navigates, menu click does not.

Acceptance: matches the layout at 390px and 1440px in both modes; tests and
lint pass.

### Task 11: Product form dialog, add and edit (spec §2.5, Phase 4)

- `src/components/products/ProductFormDialog.jsx`, a **centered** Chakra
  `Dialog` (`size` full under `sm`), used for both add (`mode="create"`) and
  edit (`mode="edit"`, prefilled from the product). Scrollable body, footer
  always visible. Replaces `NewProductModal.jsx`.
- Create flow: URL field first. When a valid `http(s)` URL is pasted or
  entered (debounce ~500ms), extraction starts automatically with
  `products.extractInfo`; a "Generate details" / "Retry" button stays
  available. While extracting, show skeletons in place of the fields. After
  extraction the fields are editable.
- Fields: URL, name, description (textarea), category, priority
  (`SegmentedControl` using `PriorityBadge` visuals), currency.
- Validation inline with `Field` error text (required URL, name, category,
  valid 3-letter currency). No nested error dialog. Extraction errors show
  inline under the URL field.
- Category select includes a "New category" option that opens a small
  popover with name and color (reuse the color picker from `CategoryModal`,
  extracted into a `CategoryColorPicker` component) and creates the category
  through the categories store, then selects it.
- Currency: a searchable Chakra `Combobox` with a static list of common ISO
  4217 codes (at least EUR, USD, GBP, JPY, CNY, CAD, AUD, CHF, SEK, NOK, DKK,
  PLN, MXN, BRL, INR) showing code and symbol; the extracted value is
  preselected.
- Edit mode calls `products.update(id, data)` (with `description`, from Task 7) and does not auto-extract.
- After create: toast with an "Open" action linking to the new product.
- Wire the Dashboard "Edit" menu item and (in Task 12) the Product page Edit
  button to this dialog.
- Component tests: validation errors shown inline, edit mode prefills and
  submits `update`, create submits `create`.

Acceptance: add and edit work end to end against the dev backend; tests and
lint pass.

### Task 12: Product detail page (spec §2.6, Phase 5)

- Header: `PageHeader` with `backLink` to the dashboard, title (max 2 lines,
  clamp), metadata row (`CategoryTag`, `PriorityBadge`, `StockStatus`,
  "Last checked {relative}" from `last_checked_at`). Actions: "Open store
  page" (external link), "Edit" (Task 11 dialog), overflow menu with Delete
  (`ConfirmDialog`, then navigate to `/` with a toast).
- Stats row, plain (no uppercase eyebrows, labels use `textStyle="caption"`,
  values `numeric`): Current price; Lowest in range (with date); Average in
  range; Current vs average (`PriceChange`).
- Chart card (recharts or `@chakra-ui/charts`), colors from theme tokens:
  - range selector `SegmentedControl` with 30 / 60 / 90 / 180 days / All,
    default = configured `hist_window_size`; filtering happens on the client
    by timestamp. The stats above follow the selected range.
  - Y domain padded around min and max (not starting at 0).
  - min marker keyed by timestamp (not by formatted date string); dashed
    average reference line.
  - out-of-stock periods as shaded `ReferenceArea` bands.
  - tooltip: date, price, change vs previous point, stock.
  - with fewer than 2 points, show "Tracking started {date}. The chart fills in
    as prices are checked." instead of the chart.
  - no legend.
- Description below the chart, clamped to 4 lines with a "Show more" / "Show
  less" toggle (only when it overflows).
- Loading skeleton, `ErrorState` with retry, 404 state that links back.
- Unit tests for the range filtering and stats computation (pure functions in
  `src/lib/`).

Acceptance: readable in both modes at 390px and 1440px; tests and lint pass.

### Task 13: Categories page (spec §2.7, Phase 6)

- `PageHeader` with "Add category" action (already moved in Task 5).
- List (or compact responsive grid) of categories: color swatch, name,
  "{count} products" (`product_count` from Task 8, pluralized with i18next
  `_one` / `_other`), edit and delete icon buttons with `aria-label`.
- Delete is disabled when `product_count > 0`, with a tooltip "Used by {count}
  products" (both locales). Otherwise it uses `ConfirmDialog`.
- `CategoryModal` → `CategoryFormDialog` using `CategoryColorPicker`: a
  radio group of swatches with `aria-label` per color name (both locales),
  visible focus ring, checked state, plus a custom color input; live preview
  of the `CategoryTag`. Inline validation for the name.
- Skeleton while loading (no layout shift), `EmptyState` with action, error
  state.
- Component tests: delete disabled with count > 0, color picker is keyboard
  selectable.

Acceptance: tests and lint pass; works at 390px and 1440px.

### Task 14: Settings page (spec §2.8, Phase 6)

- Sections General, Analysis, Notifications. From `md` up, a sticky side nav
  with anchor links to the sections; below `md`, sections stack.
- Form state: local draft initialized from the config store; `isDirty`
  derived by comparing draft and saved config.
- Sticky save bar at the bottom of the viewport, visible only when dirty,
  with "Discard" and "Save". Save calls `configStore.save(patch)`; the
  language changes only after a successful save. Warn on `beforeunload` when
  dirty, and confirm (with `ConfirmDialog`) before navigating away inside the
  app when dirty.
- Secrets (Google API key, Telegram token): masked inputs with reveal
  toggle; when a saved value exists and the field is untouched, show a
  "Configured" badge.
- Telegram as a 3-step checklist: 1) bot token, 2) link chat ("Get chat ID",
  shows the start-bot instructions in a dialog when the backend returns 404), 3) "Send test message". A status badge from `telegram_status` (Task 8):
  Not configured / Waiting for chat / Connected. The alert switches are
  enabled only when connected, and the reason is shown next to them when not.
- Historical window: segmented control that wraps or becomes a `Select` below
  `sm` (no overflow at 360px). Analysis hour select with a fixed width.
- Component tests: save bar hidden when clean and shown when dirty, language
  not applied before save, alert switches disabled unless connected.

Acceptance: no overflow at 360px; tests and lint pass.

### Task 15: Polish, 404, accessibility and i18n audit (spec Phase 7)

- 404 page: `EmptyState` composition, plain copy, one "Back to wishlist"
  action. No gradient text, no emoji, no italic quote box. Update both
  locales.
- Remove leftover dead code: `HeaderComponent`, `FooterComponent`,
  `NewProductModal`, `DeleteProductDialog`, `CategoryModal`, unused ui
  snippets, `src/assets/react.svg`, and unused i18n keys.
- i18n parity test: a Vitest test that loads both JSON files and asserts the
  same set of keys (flattened), and that no value contains `—` or `–`.
- Copy pass: one label per intent ("Add product" everywhere), consistent
  capitalization (sentence case) in both locales.
- A11y pass: every icon button has `aria-label`; dialogs return focus to the
  trigger; focus rings visible in both modes; row actions keyboard reachable.
- Motion pass: hover/press/dialog transitions per Global Constraints and
  disabled under reduced motion.
- Update `frontend/README.md` with the new structure (theme, stores, lib,
  components) and commands.

Acceptance: tests (including parity) and lint pass; build passes.

### Task 16: End-to-end smoke tests with Playwright

- Add `@playwright/test` as a frontend dev dependency and
  `frontend/playwright.config.js` that starts the Vite dev server
  (`webServer`), Chromium only, projects for desktop (1440x900) and mobile
  (390x844).
- All API calls are mocked with `page.route` using fixtures in
  `frontend/e2e/fixtures/` (0 products, 1 product with a 1-point history, 25
  products with 180-point histories, categories with counts, config in each
  `telegram_status`). No real backend needed.
- Specs in `frontend/e2e/`: dashboard renders summary and list (desktop table,
  mobile cards) and the page title is visible; add product (mocked
  extraction) and edit product; delete product with confirm; product detail
  range selector and single-point state; categories create and delete
  disabled when in use; settings save bar appears when dirty and language
  applies after save; nav active state; no horizontal scroll at 390px on every
  page; dark mode renders visible headings.
- Exclude `e2e/**` from Vitest (`test.exclude`) so unit tests do not pick up
  Playwright specs.
- Scripts `"test:e2e": "playwright test"`; `just test-e2e` recipe; ignore
  Playwright output folders in `.gitignore`. Document in READMEs.

Acceptance: `npm run test:e2e` passes locally (install browsers with
`npx playwright install chromium` if needed).

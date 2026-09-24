# Frontend UI/UX Refactor Plan

Status: proposal, pending review
Branch: `refactor/frontend-ui-ux`
Scope: `frontend/` (React 19 + Vite + Chakra UI v3 + wouter + i18next + recharts)

This document has two parts. The first is an audit of the current frontend.
It was done by reading the source and by driving the running app with
`playwright-cli` on desktop (1440x900) and mobile (390x844), in light and dark
mode. The second part is a phased plan to fix the problems the audit found.

---

## 1. Design read

> A personal, self-hosted price-tracking tool for one power user. It should
> feel calm and utility-first, like a small, focused productivity app. It stays
> on Chakra UI v3, with a custom semantic token layer on top.

This is product UI, not a marketing page. Of the taste-skill rules, we use the
ones about typography, color discipline, shape consistency, interaction states,
accessibility, dark mode and "AI tells". We ignore the landing-page rules
(heroes, bento grids, scroll choreography).

| Dial               | Value | Why                                                                                 |
| ------------------ | ----- | ----------------------------------------------------------------------------------- |
| `DESIGN_VARIANCE`  | 4     | Predictable app layout. Asymmetry only where it helps (the detail page).            |
| `MOTION_INTENSITY` | 5     | Purposeful motion: page transitions, staggered entry, list insert/remove, feedback. |
| `VISUAL_DENSITY`   | 6     | People scan a wishlist and compare prices, so more data per screen.                 |

**Design system:** keep **Chakra UI v3** (one system per project). Stop
overriding it ad hoc. Build a real theme with semantic tokens, text styles and
recipes.

---

## 2. Audit findings

Severity levels: **P0** means broken, fix now. **P1** is a major UX or design
problem. **P2** is polish or tech debt.

### 2.1 Broken / P0

| #   | Where                      | Finding                                                                                                                                                                                                                                                                   |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Dashboard hero, light mode | **Title and subtitle are invisible.** `bgGradient="to-r, blue.600, purple.600"` uses Chakra v2 syntax, so v3 renders no gradient. White text ends up on a white card and the user sees an empty box with one button in it. On mobile this box is about 230px tall.        |
| B2  | Product page header        | **The product name is invisible in light mode** for the same reason (`bgGradient="to-r, gray.800, gray.900"`). Dark mode only works because the page background happens to be dark.                                                                                       |
| B3  | Dashboard table, mobile    | The table is clipped. Its wrapper is `overflow: hidden` (551px of content in 340px), so Price change, Stock and **Delete** can't be reached below about 700px.                                                                                                            |
| B4  | Language handling          | Two sources of truth: `localStorage` and the backend config. Opening Settings silently switches the whole app to the backend language. Picking a language in the select changes the UI right away, before Save, and nothing reverts it if the user leaves without saving. |
| B5  | Product page stats         | The "Average Price" label is hardcoded in English, so it isn't translated.                                                                                                                                                                                                |
| B6  | Product page trend         | A 0.0% change shows a green down-trend arrow, because `calculateTrend` counts `0` as a drop.                                                                                                                                                                              |
| B7  | Failed fetches             | Dashboard and product fetch errors only reach `console.error`. If the API is down, the dashboard shows the "empty wishlist" state, which is wrong.                                                                                                                        |
| B8  | Settings, security         | The Telegram bot token is shown in plain text, while the Google API key is masked.                                                                                                                                                                                        |
| B9  | Console                    | React warns `Encountered a script tag while rendering React component`, which comes from `next-themes` inside `ColorModeProvider`.                                                                                                                                        |

### 2.2 Global UX / layout (P1)

- **Navigation is hidden behind a hamburger on desktop**, even though there are
  only 3 destinations. The header never shows which page you're on, and every
  page change takes 2 clicks.
- **The footer isn't pinned to the bottom.** On short pages it floats halfway
  down the viewport, with empty space under it. The shell has no
  `min-h-dvh` flex layout.
- **Pages don't share a header pattern.** The Dashboard uses a gradient banner,
  Categories and Settings use H1 + subtitle, and Product uses a dark gradient
  card. Container widths also differ (`1400px`, `container.xl`, `container.lg`,
  `1200px`).
- **Document titles don't change per route.** The browser tab always says
  "Wishlist Tracker AI".
- **Feedback is inconsistent.** Categories and Settings use toasts. The
  Dashboard gives no success or error feedback for create and delete.
  NewProductModal opens a second modal on top of itself for errors.
- **Loading states are inconsistent.** There's a big spinner (dashboard,
  product), a plain "Loading..." text (categories, settings), and no skeletons.

### 2.3 Visual design (P1)

- **The typeface isn't loaded.** The theme declares `Inter`, but no `@font-face`
  or package ships it, so the app renders in the system fallback (Arial or
  Liberation Sans on Linux). Inter is also the taste-skill "AI default". We
  should pick a deliberate face and self-host it.
- **There's no semantic color system.** About 60 `colorMode === 'light' ? X : Y`
  ternaries are spread over the pages, plus hardcoded hex values in the chart
  (`#3182CE`, `#ED8936`, `#48BB78`, `#E2E8F0`, `#718096`) and a
  `rgba(26,32,44,.8)` header. None of this adapts to the theme.
- **Color meanings clash.** Red means _high priority_, _price went up_, _out of
  stock_ and _delete_. Green means _low priority_, _price dropped_ and _in
  stock_. A red "High" tag next to a green down-trend makes the user stop and
  think.
- **Accents are mixed.** There are blue links, black primary buttons, a
  blue-purple gradient banner, a red-pink gradient on the 404 and a blue price.
  There's no single accent.
- **Radii are mixed.** Cards use `2xl` (hero) and `lg` (sections), tags are
  small, and buttons use the default `md`. There's no documented scale.
- **Eyebrows are overused** on the product page (`CURRENT PRICE`,
  `MIN PRICE IN 60 DAYS`, `AVERAGE PRICE`, `DESCRIPTION`, all uppercase with
  wide tracking).
- **The 404 page has "AI tells":** gradient text, an italic quote in a grey box
  and emoji.
- **Icons:** `react-icons/lu` (Lucide) is set to `size` per call site with no
  global stroke width. The skill prefers Phosphor, which is available as
  `react-icons/pi` in the same package.

### 2.4 Dashboard (P1)

- A full-width banner uses about 130px (230px on mobile) for one button.
- There's no overview at all, so the page can't answer questions like "what's
  the total wishlist value?", "what dropped this week?" or "what's at its
  lowest price?".
- There's no search, filter (category, priority, stock) or sort, and none of it
  is in the URL. This won't scale beyond about 15 items.
- Only the product name text is clickable. The row itself isn't.
- **The only row action is Delete**, even though the backend already supports
  `PATCH /products/{id}`. Products can't be edited anywhere.
- The Stock column shows a colored dot plus text (fine), but the price-change
  column uses color and an icon only, with no sign.
- There's no price trend in the list. The page has the history data but shows
  one number.
- The empty state is plain and has no call to action button.

### 2.5 Add product flow (P1)

- There are 3 steps (URL → Generate → edit → Save) for something that could
  start as soon as a URL is pasted.
- "Generate details" is a full-width grey button that looks disabled even when
  it isn't obviously so. It's also placed between the Priority field and the
  generated fields.
- Validation errors appear in a **second modal on top of the first one**
  instead of inline under the field.
- The category must already exist, and you can't create one from the modal.
- Currency is a free-text, 3-character input with a Wikipedia link. It should
  be a searchable select.
- Extraction takes several seconds with only a spinner inside a button. There's
  no progress or skeleton for the fields that are about to appear.

### 2.6 Product detail (P1)

- The header is invisible (B2). The "View Product Online" button is the only
  action. Edit and Delete are missing.
- There's no "last checked" timestamp and no manual "check now".
- **Chart:** the Y axis starts at 0, so a real €20 drop on a €689 item looks
  flat. There's no range selector (the window only changes in Settings). The
  legend just repeats the title, and all colors are hardcoded. The min-price
  line is keyed by a _formatted date string_, which breaks when two points
  share the same day. With one data point the chart is almost empty. It should
  show a friendly "tracking started today" state instead.
- The stock history isn't shown anywhere, even though `is_in_stock` is stored
  per record.
- Long descriptions are shown in full above the chart and push it below the
  fold.

### 2.7 Categories (P2)

- The "Add New Category" section is a whole card for one button. The button
  belongs in the page header.
- Category cards don't show how many products they have. Deleting a category
  that's in use fails only _after_ confirming, with a 400 error toast. The
  delete action should be disabled up front and explain why.
- Color swatches are `Box as="button"` with no `aria-label` and no visible
  focus ring. The custom `<input type="color">` sits next to them without a
  clear active state.
- The "Loading..." text becomes a grid, so the layout shifts.

### 2.8 Settings (P1)

- It's one long form with a single Save button at the very bottom. Nothing
  shows unsaved changes, and nothing warns before you leave with unsaved
  changes.
- Language is applied before Save (see B4).
- Setting up Telegram is an unclear 3-state process (token → "Get chat ID"
  → "Test bot") with no status indicator. The disabled Chat ID input doesn't
  have enough contrast.
- On mobile the historical-window segmented control (`30/60/90/180 días`)
  overflows its card.
- The analysis-hour select takes the full width for a 5-character value.
- The alert rows fade to 50% opacity when Telegram isn't configured, but the
  reason is only in the subtitle.

### 2.9 Code health that blocks UI work (P2)

- Data fetching is copied into every page (`fetch` + `useState` + `useEffect`).
  `/config/` is fetched separately by Dashboard and Product. There's no API
  client and no cache.
- `getPriorityColor`, `formatPrice` and the trend logic are duplicated between
  Dashboard and Product.
- There are two dialog patterns: `DeleteProductDialog` is a component, while
  the category delete dialog is inline JSX.
- The frontend has no tests.

---

## 3. Target design direction

- **Palette: modern black and white.** A monochrome neutral scale (one
  `zinc`-like family, off-black `#0a0a0a`-ish and off-white, never pure
  `#000`/`#fff`). **The accent is the foreground itself**: primary buttons are
  near-black on light and near-white on dark. There's no brand hue. Hierarchy
  comes from contrast, weight and spacing. Color is used **only for data
  semantics**, sparingly and desaturated, through **semantic tokens**:
  - `price.down` (muted green), `price.up` (muted red), `price.flat` (fg.muted)
  - `stock.in`, `stock.out` (text plus icon, color is secondary)
  - `priority.high|medium|low`: shown with **weight and icon, not traffic-light
    hues** (for example, filled, half-filled or outline flag), so priority
    never competes with price color.
  - `category.*`: user-chosen colors, shown only as small swatches or dots, not
    as filled tag backgrounds, to keep contrast safe.
- **Typography:** self-hosted through the **Fontsource** npm packages:
  **Geist + Geist Mono** (`@fontsource-variable/geist`,
  `@fontsource-variable/geist-mono`), imported once in `main.jsx` and
  referenced in the theme `fonts` tokens. Fontsource bundles the woff2 files
  with `font-display: swap`, so no external request is made. Use mono or
  `font-variant-numeric: tabular-nums` for every price and percentage so
  columns line up.
- **Shape:** one documented rule: cards and dialogs `lg` (12px), inputs and
  buttons `md` (8px), tags and badges `full`.
- **Elevation:** borders and background tints first, soft shadows only on
  floating layers (menus, dialogs, toasts).
- **Motion (`MOTION_INTENSITY 5`):** **Motion** (Framer Motion,
  `motion/react`) combined with Chakra's built-in animations. Shared
  durations and easings as theme tokens. Page transitions, staggered entry of
  lists and stats, animated insert/remove of rows and cards, chart line
  draw-in, sliding save bar, press feedback (`scale 0.98`). Every animation
  has a purpose (no decorative loops) and everything respects
  `prefers-reduced-motion`.
- **Icons:** keep **Lucide** (`react-icons/lu`), with one global size scale
  and stroke width.

---

## 4. Phased plan

Each phase ends in a state that can be merged, gets a Playwright smoke check,
and goes in its own PR (or its own group of commits on this branch). Phases 0-2
are prerequisites. Phases 3-7 can be reordered.

### Phase 0: Hotfixes (≈0.5 day)

Fix B1-B9 with minimal changes so `main` is usable again while the refactor is
in progress.

- [ ] Replace the v2 `bgGradient` strings with the v3 API (`bgGradient="to-r"` + `gradientFrom`/`gradientTo`), or drop the gradients (Phase 3 removes
      them anyway).
- [ ] Wrap the dashboard table in `Table.ScrollArea`, or allow `overflowX:auto`.
- [ ] Settings: don't apply or persist the language until Save. Treat the
      backend config as the single source of truth once it has loaded.
- [ ] Translate the "Average Price" label (`pages.product.price.average`).
- [ ] Treat `0` as a flat trend (`LuMinus`, muted color).
- [ ] Show an error state (with a retry button) when a fetch fails, instead of
      the empty state.
- [ ] Mask the Telegram token (`type="password"` + reveal toggle).
- [ ] Look into the `next-themes` script warning (upgrade, or set up
      `ThemeProvider` with `disableTransitionOnChange` / `scriptProps`).

### Phase 1: Foundations (≈2 days)

- [ ] **Theme:** rewrite `src/theme.js` into `src/theme/` with:
  - `tokens` (colors, fonts, radii, shadows, durations)
  - `semanticTokens` (`bg`, `bg.subtle`, `bg.muted`, `fg`, `fg.muted`,
    `border`, `accent.*`, `price.*`, `stock.*`, `priority.*`) with
    `_light`/`_dark` values
  - `textStyles` (`display`, `heading.lg|md|sm`, `body`, `caption`, `numeric`)
  - recipes for `Button`, `Card`, `Badge`, `Input` so the rules above live in
    one place
- [ ] Remove **every** `useColorMode()` ternary used for styling and replace it
      with semantic tokens. Keep `useColorMode` only for the toggle.
- [ ] Install `@fontsource-variable/geist` and
      `@fontsource-variable/geist-mono`, import them in `main.jsx`, point the
      `heading`/`body`/`mono` font tokens at them and remove every `Inter`
      reference.
- [ ] Keep Lucide. Add one `<Icon as={...} />` usage convention with a global
      size scale and stroke instead of per-call `size={20}`.
- [ ] **Layout shell** (`src/components/layout/`):
  - `AppShell`: `min-h-dvh` grid with header, main and footer, so the footer
    stays at the bottom.
  - `AppHeader`: brand plus **inline nav with an active state** (`md+`), a
    theme toggle, and a language switcher (optional). Uses a bottom tab bar or
    drawer under `md`.
  - `PageHeader`: title, optional description and an actions slot. Used by
    every page.
  - `PageContainer`: one max width (`7xl`, about 1280px) and one horizontal
    padding scale.
- [ ] `useDocumentTitle(title)` hook, applied on every route.

### Phase 2: Data layer & states (≈1.5 days)

- [ ] `src/lib/api/` with a small `request()` wrapper that throws typed
      errors, plus resource modules (`products`, `categories`, `config`,
      `telegram`).
- [ ] Add **Zustand** stores, one per resource (`useProductsStore`,
      `useCategoriesStore`, `useConfigStore`). Each store holds `data`,
      `status` (`idle | loading | success | error`) and `error`, plus async
      actions (`fetch`, `create`, `update`, `remove`) that call the API client
      and update the state. After a mutation, the store updates its own data
      or refetches it, so pages no longer refetch by hand. This removes the
      fetch-in-effect code in the pages and the `eslint-disable` comments.
- [ ] Config is loaded once into `useConfigStore` and shared by every page
      (today `/config/` is fetched separately by Dashboard and Product). The
      store is also the single source of truth for the language (B4).
- [ ] Use selectors (`useProductsStore((s) => s.items)`) so components only
      re-render on the slices they read.
- [ ] Shared components for states: `LoadingSkeleton` (one per layout),
      `EmptyState` (icon, title, text, CTA), `ErrorState` (message plus
      Retry).
- [ ] One feedback pattern: toasts for mutations, inline messages for
      validation. No nested error modals.
- [ ] `src/lib/format.js`: `formatPrice`, `formatPercent`, `formatDate`,
      `formatRelative` (uses `Intl.RelativeTimeFormat`), `getTrend(value)`.
      Map the locale from the i18n language once.
- [ ] One `ConfirmDialog` component, used by product and category deletes.

### Phase 3: Dashboard redesign (≈2.5 days)

Layout (desktop):

```
┌ PageHeader: "Wishlist"                     [+ Add product] ┐
├ Summary strip: Items · Total value · Price drops (N days) · At lowest ┤
├ Product list                                                ┤
│  name + category dot │ priority │ sparkline │ price │ Δ% │ stock │ ⋯ │
└─────────────────────────────────────────────────────────────┘
```

- [ ] Drop the gradient banner. The primary CTA goes in the `PageHeader`.
- [ ] **Summary strip** with 3-4 plain stats (no card per stat): item count,
      total current value per currency, number of drops in the window, number
      of items at their window minimum.
- **Out of scope for this branch:** search, filters and sorting. They're
  planned for later. The list layout should leave room for a toolbar above it.
- [ ] **Responsive list:**
  - `md+`: table with tabular numbers, the **whole row clickable**, and a
    row-actions menu (`⋯`: Open, Edit, Open store page, Delete).
  - `<md`: stacked cards (name, category dot, price with Δ badge, stock). Tap
    opens the detail page. Actions sit in a menu.
- [ ] **Sparkline** per row (last N prices). Needs **backend support**: add
      `recent_prices: number[]` (or a `?include=sparkline` flag) to
      `/products/dashboard-summary`.
- [ ] Δ% shows a **sign** (`-3.2%`) in addition to color and icon (a11y).
- [ ] Empty state with an illustration-free composition plus a primary CTA.
- [ ] Skeleton rows while loading.

### Phase 4: Add / edit product flow (≈2 days)

- [ ] Paste-first: once the user pastes a valid URL, extraction starts on its
      own (the "Generate" button stays as a retry). Skeleton fields show while
      the extraction runs.
- [ ] One form component, `ProductForm`, shared by **Add** and **Edit**. Wire
      up `PATCH /products/{id}`.
- [ ] Inline validation with `Field.ErrorText`. Remove the nested error dialog.
- [ ] Category select with a "+ New category" option that opens a small
      popover (reuses `CategoryForm`).
- [ ] Currency as a searchable combobox (ISO 4217 list plus symbols), with the
      extracted value preselected.
- [ ] Priority as a segmented control using the new priority visuals.
- [ ] Keep a **centered `Dialog`** for both Add and Edit (full-screen
      `size="full"` under `sm`), with a scrollable body and a footer that
      stays visible.
- [ ] Toast with an "Open" action after the product is created.

### Phase 5: Product detail (≈2 days)

Layout (desktop, variance 4, a light asymmetric split):

```
← Wishlist
┌ Title (2 lines max)                 [Open store ↗] [Edit] [⋯] ┐
│ category · priority · stock · last checked 3h ago            │
├ Stats: Current │ Window min (date) │ Window avg │ Δ vs avg   ┤
├ Chart card  [30d 60d 90d 180d All]                          ┤
│   area chart, auto Y domain, min/avg markers, stock gaps     │
├ Description (clamped to 4 lines, "Show more")                ┤
└──────────────────────────────────────────────────────────────┘
```

- [ ] Replace the dark gradient header with `PageHeader` plus a metadata row.
- [ ] Actions: open the store page, **Edit** (Phase 4 form), **Delete** (with
      confirmation, then navigate back and show a toast).
- [ ] "Last checked" from the newest history timestamp. (Optional backend
      work: a "check now" endpoint.)
- [ ] **Chart rebuild** with `@chakra-ui/charts` (already installed) or
      recharts using theme tokens:
  - Y domain `['dataMin - pad', 'dataMax + pad']`
  - range selector that runs on the client (defaults to the configured window)
  - min marker keyed by timestamp, not by the formatted date
  - out-of-stock periods shown as shaded bands
  - tooltip showing the date, price, Δ vs the previous point and stock
  - a single-point state that reads "Tracking started {date}. The chart fills
    in as prices are checked."
- [ ] Clamp the description to 4 lines, below the chart.
- [ ] Remove the uppercase eyebrows. Use `textStyle="caption"` labels instead.

### Phase 6: Categories & Settings (≈2 days)

**Categories**

- [ ] The primary action goes in `PageHeader`. Remove the "Add New Category"
      card.
- [ ] List (or compact grid) showing a swatch, the name and the **product
      count**. Needs **backend support**: add `product_count` to
      `GET /categories/`.
- [ ] Delete is disabled with a tooltip ("Used by 3 products") when the
      count is above 0.
- [ ] Accessible swatch picker: a `RadioGroup` with `aria-label` per color, a
      visible focus ring and a live preview of the tag.

**Settings**

- [ ] Split the page into sections with an anchored side nav (`md+`):
      General, Analysis, Notifications.
- [ ] **Sticky save bar** that shows up only when the form has changes
      (Discard / Save), plus a `beforeunload` / route-leave guard.
- [ ] Language applied on Save (B4). Optionally, a language switch in the
      header for quick changes, which also persists.
- [ ] Secrets: masked inputs with reveal and copy. Show "Configured" badges
      instead of raw values after saving.
- [ ] **Telegram setup as a 3-step checklist** (token → link chat → test) with
      a status badge (Not configured / Waiting for /start / Connected). Alert
      toggles are only enabled once it's connected, and the reason sits next
      to them.
- [ ] Fix the mobile overflow of the segmented control (wrap it, or turn it
      into a `Select` under `sm`).
- [ ] The analysis-hour select gets a fixed width.

### Phase 7: Polish, a11y & QA (≈1.5 days)

- [ ] Redo the 404 page with the shared `EmptyState` (no gradient text, no
      emoji, one CTA).
- [ ] Motion pass (consistency check of the motion listed in §3). Check `prefers-reduced-motion`.
- [ ] A11y pass: visible `:focus-visible` everywhere, icon buttons with
      labels, dialogs with focus returned to their trigger, color never the
      only signal, WCAG AA contrast in both modes (including disabled inputs
      and category-colored text).
- [ ] i18n audit: no hardcoded strings (lint rule or script that compares
      `english.json` and `spanish.json` keys).
- [ ] Responsive QA at 360 / 390 / 768 / 1024 / 1440 in both themes.
- [ ] Copy pass: consistent labels ("Add product" everywhere, one intent per
      label). Rename the app title if you want (drop the "AI" suffix?).

### Phase 8: Tests (runs alongside the other phases)

- [ ] Vitest + Testing Library for `lib/format.js`, `getTrend`, and the
      Zustand store actions (with the API client mocked).
- [ ] Playwright e2e smoke (`frontend/e2e/`) with **API mocking** (fixtures
      for 0, 1 and 25 products, 1-point and 180-point histories). It covers
      the dashboard, add product (mocked extraction), edit, delete,
      category CRUD, settings dirty state and language switch.
- [ ] Visual snapshots of each page in light, dark and mobile, to catch
      regressions like B1/B2 automatically.
- [ ] Add `just test-frontend` and wire it into pre-commit or CI.

---

## 5. Backend changes needed

These are done **in this branch**, next to the frontend phase that needs them.
Each change keeps the existing response fields and only adds new ones. The
backend has no test suite yet, so this branch adds `pytest` with a small
set of tests for the endpoints it touches.

| Change                                                    | Needed by | Size  |
| --------------------------------------------------------- | --------- | ----- |
| `recent_prices` (sparkline) in `dashboard-summary`        | Phase 3   | Small |
| `last_checked_at` in dashboard summary and product detail | Phase 3/5 | Small |
| `product_count` in `GET /categories/`                     | Phase 6   | Small |
| (Optional) `POST /products/{id}/refresh` for "check now"  | Phase 5   | Med   |
| (Optional) Telegram status in `GET /config/`              | Phase 6   | Small |

---

## 6. Decisions

| Topic              | Decision                                                   |
| ------------------ | ---------------------------------------------------------- |
| Visual style       | Modern black and white. Color only for data semantics.     |
| Typeface           | Geist + Geist Mono through the Fontsource npm packages.    |
| Icons              | Keep Lucide (`react-icons/lu`).                            |
| State / data       | Zustand stores with async actions and a shared API client. |
| Add/Edit container | Centered dialog (full screen on mobile).                   |
| Backend changes    | In this branch (full refactor branch).                     |
| Motion             | Motion (Framer Motion) + Chakra animations.                |
| Search/filter/sort | Out of scope for this branch. It will be done later.       |

## 7. Estimate

About 13-15 focused days in total, now that search/filter/sort is out of scope. Phase 0 can ship on its own right away.

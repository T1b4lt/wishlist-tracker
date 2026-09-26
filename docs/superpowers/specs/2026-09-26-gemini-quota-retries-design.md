# Gemini Quota Retries — Design

- **Date:** 2026-09-26
- **Branch:** `feat/gemini-quota-retries`
- **Status:** Approved in brainstorming, pending spec review

## 1. Goal

The daily price check calls Gemini (through Stagehand) for every product. When
the Gemini quota runs out — requests per minute (RPM) or per day (RPD) — the
products left in that run get no record for the day and nothing recovers them.
This feature makes the daily check **resume** those products later the same
day, **tells the user** on the web and on Telegram when the quota interfered,
and makes sure no product is **starved** when the daily quota is smaller than
the wishlist.

### Success criteria

- A quota error during the daily run stops it; the products left are retried
  every 10 minutes for the rest of the local day until each one has its record.
- When the daily quota cannot cover every product, the ones left out one day
  are checked first the next day (coverage rotates).
- The dashboard shows, on days the quota was reached, when it happened, how
  many products were left at that moment and how many are still pending.
- A Telegram report is sent once per day according to a three-way setting
  (off / only on days the limit is reached / every day): "done" when no
  product is left pending, or "left unchecked" at the end of the day.

### Constraints / decisions

- **No backward compatibility.** The project is in development; the database
  will be recreated. New tables, no migration code.
- **A lost day is not backfilled.** There is one record per product per local
  day; a price read today must not be stored as yesterday's. Pending retries
  are dropped when the local day ends.
- **No deliberate delays between products.** With the default model
  (`gemini-flash-lite-latest`: 15 RPM, 500 RPD) and ~2 requests per product
  (dismiss pop-ups + extract), taking 10–20 s each, a run stays under the RPM
  limit. RPD caps a day at roughly 250 products.
- **Gemini's daily quota resets at midnight Pacific time**, not at the local
  midnight used for records. Retries every 10 minutes pick up the reset on
  their own; no special handling.

### Reference: the quota error

Captured from a real free-tier error. Google answers HTTP 429
`RESOURCE_EXHAUSTED`; Stagehand retries the call 3 times and then raises
`stagehand.rpc_client.RPCError` (`code=-32603`,
`data={"name": "AI_RetryError"}`) whose message is:

```
Failed after 3 attempts. Last error: AI_APICallError: You exceeded your current
quota, please check your plan and billing details. [...]
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-2.5-flash
Please retry in 10.598793198s.
```

Neither `429` nor `RESOURCE_EXHAUSTED` appears in the message.

## 2. Already implemented (baseline for this spec)

Done on this branch before the spec, with tests:

- `stagehand_utils.is_rate_limit_error(error)`: true for an `RPCError` whose
  message matches `exceeded your current quota`, `quota exceeded`,
  `resource_exhausted` or a standalone `429` (case-insensitive).
- `PendingStatusRetry` table: `product_id` (PK, FK → `product.id`,
  `ON DELETE CASCADE`), `day_start` (Unix seconds of the local day start).
- Cronjob split into `_check_product` (one product → `_CheckOutcome`:
  `STORED`, `SKIPPED`, `FAILED`, `RATE_LIMITED`) and `_check_products` (stops
  at the first `RATE_LIMITED`, returns the IDs left without a record today).
- `fetch_and_store_product_status`: full run; replaces all pending retries
  with the products left by a quota error.
- `retry_rate_limited_products`: deletes pending rows from other days, checks
  today's pending products, removes the ones checked (stored, skipped or
  failed for a non-quota reason), keeps the ones left by a new quota error.
- Both passes check products **least recently checked first** (never checked
  first, then by last record timestamp, then by ID).
- `main()` currently runs the full check when the hour equals
  `analysis_hour` and the retry pass otherwise. **Section 3 replaces this.**

## 3. Scheduling and daily state

### 3.1 Cron every 10 minutes

- `entrypoint.sh` schedules `*/10 * * * *` (was `0 * * * *`).
- The README crontab example changes accordingly.

### 3.2 `DailyCheckRun` table

One row per local day, created by that day's full run.

| Column             | Type          | Meaning                                                    |
| ------------------ | ------------- | ---------------------------------------------------------- |
| `day_start`        | int, PK       | Unix seconds of the local day start                        |
| `started_at`       | int           | When the full run started                                  |
| `total_products`   | int           | Products that existed when the full run started            |
| `limit_reached_at` | int, nullable | First quota error of the day (full run or retries)         |
| `pending_at_limit` | int, nullable | Products left pending at that first quota error            |
| `report_sent`      | bool          | Whether today's Telegram report was sent (default `false`) |

`PendingStatusRetry` stays the live list of pending products; `DailyCheckRun`
is the day's summary. Rows from previous days are kept (tiny; one per day) and
never read except for today's.

`limit_reached_at` / `pending_at_limit` are set only by the full run (retries
only exist after a quota error in it) and never overwritten by later retries,
so they keep the snapshot of the first quota error of the day.

### 3.3 Decision logic of each run (`main`)

Every run, with `now` = local time:

1. **Full run** — if there is no `DailyCheckRun` for today **and**
   `now.hour >= analysis_hour`: create the row (`started_at`,
   `total_products`), run `fetch_and_store_product_status`, and on a quota
   error record `limit_reached_at` and `pending_at_limit`.
   This replaces `hour == analysis_hour`: the full run happens once per day
   even when the scheduled tick is missed (container stopped or restarted).
   Behaviour change: starting the container at 18:00 with `analysis_hour=12`
   runs that day's full check at 18:00 instead of skipping the day.
2. **Retry pass** — otherwise, if today's `DailyCheckRun` exists: run
   `retry_rate_limited_products` (a no-op when nothing is pending).
3. **Report** — after 1 or 2, if today's `DailyCheckRun` exists, evaluate the
   Telegram report (section 4).

Before `analysis_hour` with no row for today, the run only deletes stale
pending rows and exits.

## 4. Telegram daily report

### 4.1 Setting

- New Config key `daily_check_report`: `off` | `limit_days` | `every_day`,
  default `limit_days`.
- Allowed values and default live in a new shared contract
  `contracts/daily-check-report.json` (same pattern as `hist-window.json`),
  checked by backend and frontend tests.
- Exposed in `GET /config/` and `PATCH /config/` as a typed `Literal`;
  invalid values answer 422 like `hist_window_size`.

### 4.2 Messages

Localized in English and Spanish in `telegram_utils.py`, following
`selected_language`, like the existing alerts. Times use the local time of
the process (`TZ`), formatted `HH:MM`.

- **Done** — no product is pending:
  - `✅ Daily check completed: {recorded} of {total} products recorded ({failed} failed).`
  - On a limit day, an extra line:
    `Gemini limit reached at {HH:MM} with {pending_at_limit} products left; finished by retrying.`
  - The `({failed} failed)` part is omitted when `failed` is 0.
- **Left unchecked** — end of day with products still pending:
  - `⚠️ {pending} of {total} products could not be checked today: the Gemini limit was reached at {HH:MM} with {pending_at_limit} products left. Tomorrow's run will check them first.`

Counts, for today's local day:

- `total` = `DailyCheckRun.total_products`.
- `recorded` = existing products with a `ProductHist` record today.
- `pending` = today's `PendingStatusRetry` rows.
- `failed` = `max(total - recorded - pending, 0)` (includes products deleted
  during the day; acceptable for a summary).

### 4.3 When it is sent

Evaluated at the end of every run that has today's `DailyCheckRun`:

- Skip if `report_sent`, if Telegram is not configured (token and chat ID),
  or if the mode is `off`.
- Skip if the mode is `limit_days` and `limit_reached_at` is null.
- If `pending == 0` → send **Done**.
- Else if `now >= 23:50` local → send **Left unchecked**.
- Set `report_sent = true` only after a successful send; a failed send is
  logged and retried by the next run (until the day ends).

Edge case: with `analysis_hour=23`, a full run finishing at 23:00 with nothing
pending sends Done at once; products still pending at 23:50 get Left unchecked.

## 5. API

New router `daily_check_router.py` + service `daily_check_service.py`:

`GET /daily-check/` → today's status, using the same local day as the cronjob:

```json
{
  "day_start": 1790200000,
  "started_at": 1790244000,
  "total_products": 40,
  "limit_reached_at": 1790244180,
  "pending_at_limit": 15,
  "pending_now": 12
}
```

- Before today's full run: `started_at`, `total_products`,
  `limit_reached_at` and `pending_at_limit` are `null`; `pending_now` is `0`.
- `pending_now` counts today's `PendingStatusRetry` rows only.
- The response fields are added to `contracts/api-fields.json`.

The local-day helper (`_local_day_bounds`) moves from the cronjob to a shared
module (`src/core/local_day.py`) so the service and the cronjob agree.

## 6. Frontend

### 6.1 Dashboard notice

- `lib/api/dailyCheck.js` (`getDailyCheck`) and a small zustand store
  `stores/dailyCheckStore.js`, following the existing stores.
- `components/dashboard/DailyCheckNotice.jsx`: a Chakra `Alert` above the
  product list, fetched when the dashboard mounts and when the window regains
  focus.
  - Limit reached, `pending_now > 0` — warning:
    "Gemini limit reached at 12:03 with 15 products left to check today. 12
    still pending, retrying every 10 minutes."
  - Limit reached, `pending_now == 0` — success:
    "Gemini limit reached at 12:03; all products were checked by retrying."
  - No limit today or no run yet — nothing rendered.
- Times are rendered in the browser's local time.
- A failed fetch renders nothing; it never blocks the dashboard.
- English and Spanish i18n keys.

### 6.2 Settings

- `NotificationsSection`: a "Daily check report" select — Off / Only on days
  the limit is reached / Every day — with options from the new contract.
- Disabled with the same reason hint as the existing alert toggles when
  Telegram is not connected.
- Part of the Settings draft/save flow like the other fields.

## 7. Testing

- **Backend**
  - `main` decision logic: full run once per day, at or after
    `analysis_hour`; retries afterwards; nothing before `analysis_hour`.
  - `DailyCheckRun` fields: `total_products`, `limit_reached_at`,
    `pending_at_limit` set once.
  - Report: each mode × Done / Left unchecked / nothing; `report_sent` set
    only on success; failed send retried; counts (recorded, failed, pending).
  - Message builders in both languages.
  - `GET /daily-check/` (before the run, limit day, normal day) and
    `daily_check_report` in `/config/` (valid, invalid).
  - Contract tests for `daily-check-report.json` and the new API fields.
- **Frontend**
  - API client and store.
  - `DailyCheckNotice` in its three states and on fetch failure.
  - Settings select (options, disabled state, save).
  - Contract tests.
  - Playwright e2e expectations and snapshots updated where the dashboard or
    Settings change.

## 8. Documentation

- Root README: cron every 10 minutes, `DailyCheckRun` in the schema,
  `GET /daily-check/` in the API reference, the `daily_check_report` config
  key and setting, and "What the Cronjob Does".
- `contracts/README.md`: the new contract row.
- `entrypoint.sh`: schedule comment.
- `backend/README.md`: test coverage line.

## 9. Out of scope

- Waiting for Google's `retryDelay` inside a run.
- Configurable retry interval.
- Backfilling missed days.
- Per-product quota accounting or history of past days in the UI.

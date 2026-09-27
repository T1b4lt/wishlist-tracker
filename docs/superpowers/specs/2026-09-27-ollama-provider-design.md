# Ollama AI Provider — Design

- **Date:** 2026-09-27
- **Branch:** `feat/ollama-provider`
- **Status:** Approved in brainstorming, pending spec review

## 1. Goal

Wishlist Tracker extracts product info and daily prices with Stagehand, today
always driven by Gemini through Google AI Studio. This feature makes the AI
backend a **user-selectable provider**: Google AI Studio (the current path,
still the default) or a self-hosted **Ollama** instance. It also generalizes
the Gemini quota-retry machinery into a provider-agnostic "provider
temporarily unavailable" flow, so an Ollama instance that is switched off is
retried and reported instead of silently losing the day.

### Success criteria

- Settings has a new **AI provider** section: a Google AI Studio / Ollama
  switch; the Google API key moves there from *General*; Ollama is configured
  with its base URL and a model picked from a dropdown filled from the
  instance's `/api/tags`.
- Picking an Ollama model under 20B parameters shows a warning that small
  models do not guarantee good results.
- With Ollama selected, product-info extraction and the daily price check run
  entirely on Ollama (validated with `gemma4:e4b` and `qwen3.8:latest` in the
  feasibility spike).
- When Ollama cannot be reached, the daily run stops, the offers left are
  retried every 10 minutes for the rest of the day, and the user gets one
  Telegram alert asking to check the instance, plus one "back online" message
  once the pending offers are checked.
- **No regression on the Google path:** an existing installation (no
  `ai_provider` key) keeps using Google with identical behaviour, messages and
  quota handling. The existing Google quota tests pass with only signature
  changes.

### Constraints / decisions

- **Google AI Studio stays the default** provider, and the fallback for a
  missing or unknown `ai_provider` value.
- **One active provider at a time.** Both providers' settings are kept when
  switching, so switching back needs no re-entry.
- **Stagehand v4 has no Ollama provider and no `base_url` option.** It only
  accepts `openai`, `anthropic`, `google`, `groq` and `cerebras` model names;
  anything else goes through its *bring-your-own-LLM* callback
  (`Stagehand.create(model=<async callable>)`). Ollama is wired through that
  callback, forwarding each request to `POST /api/chat` with the JSON schema
  as `format` (Ollama structured outputs).
- **Ollama rejects `\d` in schema patterns** (`failed to parse grammar`);
  Stagehand's act schema uses `pattern: "^\d+-\d+$"`. The callback rewrites
  `\d` to `[0-9]` before sending, keeping the constraint.
- **The backend owns all business logic** (AGENTS.md): it lists the Ollama
  models, decides which ones are "small", normalizes the URL and classifies
  provider errors. The frontend only presents it.
- **Pre-release database.** The app has not reached v1.0.0, so the new
  columns go straight into the Alembic baseline migration
  (`20260927_e4c87bf1c218_initial_schema.py`); no new revision, no backfill.
- **No Ollama quota.** Ollama never produces a quota error, so the quota path
  simply never triggers for it.

## 2. Configuration

Key-value `Config` rows (no schema change):

| Key            | Values                                | Default              |
| -------------- | ------------------------------------- | -------------------- |
| `ai_provider`  | `"google_ai_studio"` \| `"ollama"`    | `"google_ai_studio"` |
| `google_api_key` | unchanged                           | `""`                 |
| `ollama_url`   | normalized base URL, e.g. `http://192.168.1.20:11434` | `""` |
| `ollama_model` | an Ollama model tag, e.g. `qwen3.8:latest` | `""`            |

- `core/config.py` gains `AI_PROVIDER_OPTIONS = ("google_ai_studio", "ollama")`,
  `DEFAULT_AI_PROVIDER`, the `AIProviderName` literal and
  `get_ai_provider(session)`, which falls back to the default on an unknown
  value (same pattern as `get_daily_check_report`). The three new keys join
  `CONFIG_DEFAULTS`.
- **URL normalization** (backend, on save and on the models endpoint): trim,
  prepend `http://` when no scheme is given, drop trailing slashes. An empty
  string clears it.

## 3. The `src/ai/` package

A strategy per provider behind one interface; consumers never branch on the
provider.

### `ai/base.py`

- `ProviderErrorKind` enum: `QUOTA_EXHAUSTED`, `UNAVAILABLE`.
- `AIProvider` abstract base class:
  - `name: str` (`"google_ai_studio"` / `"ollama"`) and `label: str`
    (`"Google AI Studio"` / `"Ollama"`).
  - `is_configured() -> bool`.
  - `stagehand_options() -> dict`: the model-related keyword arguments for
    `Stagehand.create` (`model` and, for Google, `model_api_key`).
  - `async preflight() -> None`: a cheap reachability check run before a
    batch of checks; raises `ProviderUnavailableError` on failure. No-op by
    default.
  - `classify_error(error: BaseException) -> ProviderErrorKind | None`.
- `ProviderUnavailableError(Exception)`: raised by `preflight()` and by the
  Ollama callback; carries a human-readable reason.

### `ai/google_ai_studio.py` — `GoogleAIStudioProvider(api_key)`

- Takes over `MODEL_NAME` and the quota regex from `stagehand_utils.py`
  unchanged.
- `stagehand_options()` → `{"model": MODEL_NAME, "model_api_key": api_key}`.
- `classify_error` → `QUOTA_EXHAUSTED` exactly when today's
  `is_rate_limit_error` returns True (a Stagehand `RPCError` matching the
  regex); otherwise None. `is_rate_limit_error` is removed; its tests move to
  this class.

### `ai/ollama.py` — `OllamaProvider(base_url, model)`

- `stagehand_options()` → `{"model": self._generate}`, the callback from the
  spike: maps Stagehand messages (text blocks joined, image blocks to
  `images`) and the system prompt to `/api/chat` with `format` = sanitized
  schema, `stream: false`, `think: false`, the requested temperature, and
  returns an `LLMStructuredGenerateResult` with token usage. Non-structured
  requests raise `TypeError`.
- Timeout: 600 s per request (local models on large page snapshots are slow).
- **Unavailability detection without string matching:** connection errors,
  timeouts, HTTP 5xx and "model not found" (HTTP 404) raise
  `ProviderUnavailableError` *and* set `self._unavailable_reason` on the
  instance. `classify_error` returns `UNAVAILABLE` when the error is a
  `ProviderUnavailableError` or when the instance recorded a failure during
  the call (the error that reaches Python is Stagehand's `RPCError` wrapping
  it). Any other error (e.g. invalid JSON from the model) is None, i.e. an
  ordinary failure of that offer.
- `preflight()`: `GET /api/tags` (10 s timeout) and check `ollama_model` is
  listed; otherwise `ProviderUnavailableError`.
- Module function `list_models(base_url) -> list[OllamaModel]` (name,
  `parameter_size` string as reported, `parameter_billions: float | None`
  parsed from e.g. `"8.0B"`/`"27.3B"`/`"567M"`, `is_small`), raising
  `ProviderUnavailableError` when unreachable. `SMALL_MODEL_THRESHOLD_B = 20`.
  `is_small` is None when the size cannot be parsed (no warning shown).

### `ai/factory.py`

- `load_ai_provider(session) -> AIProvider`: reads `ai_provider` and the
  matching keys, returns the provider (possibly unconfigured).

### Consumers

- `stagehand_utils.get_product_info` / `get_product_status` and
  `_open_product_page` take `provider: AIProvider` instead of
  `google_api_key`; `Stagehand.create(browser=..., **provider.stagehand_options())`.
  Everything else (pop-up dismissal, prompts, favicon) is unchanged.
- `offer_check_service.check_offer(session, offer, provider, tg, now, ...)`,
  `check_offer_now`, the cronjob passes and `product_service.extract_product_info`
  load the provider once with the factory. Each `if not google_api_key` becomes
  `if not provider.is_configured()`.
- `extract_product_info` 400 detail: the current Google message when Google
  is selected; "Ollama is not configured. Please set its URL and model in
  Settings." for Ollama. An `UNAVAILABLE` error during extraction becomes a
  **503** with "Could not reach Ollama at <url>".
- The temporary `backend/src/ollama_stagehand.py` spike script is deleted.

## 4. Provider unavailability flow

### Check outcomes

- `CheckOutcome.RATE_LIMITED` stays (quota) and `CheckOutcome.PROVIDER_UNAVAILABLE`
  is added. A `stops_run` property is True for both.
- `check_offer` maps `provider.classify_error(e)`: `QUOTA_EXHAUSTED` →
  `RATE_LIMITED` (same log line as today), `UNAVAILABLE` →
  `PROVIDER_UNAVAILABLE`, None → `FAILED`.
- `_check_offers(session, offers, provider, now)` stops at the first outcome
  with `stops_run`, exactly as it stops at `RATE_LIMITED` today, and returns
  `(pending_ids, limit_reached_at, limit_reason)`.

### Preflight

- `fetch_and_store_product_status` and `retry_rate_limited_products` call
  `provider.preflight()` before checking. On `ProviderUnavailableError` the
  pass stops with every offer of the pass pending (the full run still creates
  its `DailyCheckRun`), so an Ollama instance that is down does not launch
  Chrome every 10 minutes. Google's no-op preflight keeps its path unchanged.
- `check_offer_now` skips preflight (a single check; its failure is
  classified the same way).

### `DailyCheckRun` (edited in the baseline migration)

- `limit_reason: str | None` — `"quota"` | `"unavailable"`: the reason of
  the day's first stop, set together with `limit_reached_at` and never
  overwritten, like the existing snapshot.
- `unavailable_alert_sent: bool = False`, `recovered_alert_sent: bool = False`.

`PendingStatusRetry` and the 10-minute retry pass are reused unchanged.

### Telegram alerts (provider unavailability)

Sent whenever Telegram is configured (token + chat id), independently of the
price/stock alert switches and of `daily_check_report`, since they are
operational alerts. At most one pair per local day.

- **Unavailable:** on the day's first `PROVIDER_UNAVAILABLE` stop of a
  cronjob pass (full or retry) with `unavailable_alert_sent` False. Text
  (en/es), e.g. *"⚠️ I can't reach Ollama at http://192.168.1.20:11434 (model
  qwen3.8:latest). Please switch the instance on or check what is going on.
  N prices are pending; I'll retry every 10 minutes."* Sets
  `unavailable_alert_sent` only after a successful send, so a failed send is
  retried by the next pass.
- **Recovered:** when a pass leaves no offer pending and
  `unavailable_alert_sent` is True and `recovered_alert_sent` is False. Text,
  e.g. *"✅ Ollama is available again: X prices checked."* (X = offers
  recorded today).
- A second outage on the same day sends nothing more.
- A `check_offer_now` failure before the day's run sends nothing (the offer is
  left to that run, as today).

### Daily report and dashboard notice

- `daily_check_report = "limit_days"` also fires on days with
  `limit_reason = "unavailable"` (it already keys on `limit_reached_at`).
- The report builders and the dashboard notice pick their texts by
  `limit_reason`: `"quota"` keeps today's "Gemini limit reached…" texts
  verbatim; `"unavailable"` uses new "Ollama unavailable since HH:MM…" texts
  (en/es).
- `DailyCheckStatusResponse` gains `limit_reason`.

## 5. API

- `ConfigUpdate`: `ai_provider: AIProviderName | None`, `ollama_url: str | None`,
  `ollama_model: str | None` (422 on an unknown provider via the literal).
- `ConfigResponse`: `ai_provider`, `ollama_url | None`, `ollama_model | None`
  and the read-only `ai_provider_options`.
- Saving never requires Ollama to be reachable (same as saving an empty
  Google key today).
- New router `ai_router.py`: `GET /ai/ollama/models?url=<base url>` →
  `{"models": [{"name", "parameter_size", "parameter_billions", "is_small"}],
  "small_model_threshold_b": 20}`, models sorted by name; **502** with a
  detail when the instance cannot be reached; **422** on an empty URL. The URL
  is a query parameter so models can be listed before saving.

## 6. Frontend

- **`AIProviderSection`** (`id="ai-provider"`), between *General* and
  *Analysis*; `SettingsNav` gains the entry.
  - A segmented control (select below `sm`, like the historical window) with
    the options from `config.ai_provider_options`.
  - **Google AI Studio:** the existing Google API key `SecretInput`, moved
    as-is from `GeneralSection` (which keeps only the language).
  - **Ollama:** a URL input and a model `Select`. Models load from
    `GET /ai/ollama/models` when the draft URL changes (debounced, ~600 ms) and
    from a refresh button; items read "qwen3.8:latest · 27.3B". While loading,
    the select shows a spinner; when unreachable, an inline error with the
    backend's detail. A saved model missing from the list stays selectable,
    labelled "not available".
  - When the selected model has `is_small`, a warning callout: *"Models under
    20B parameters don't guarantee good results. Bigger models such as
    qwen3.8 work reliably."* (threshold from the response).
- `lib/api/ai.js` (`fetchOllamaModels(url)`), `settingsDraft.js` and
  `SettingsPage`'s `DEFAULT_DRAFT` gain the three fields.
- `DailyCheckNotice` chooses its text by `limit_reason`.
- i18n: new keys in `english.json` and `spanish.json`.

## 7. Testing

- **Providers (unit):** Google `classify_error` (the current quota cases);
  Ollama `classify_error` for connection error, timeout, 5xx, 404 and an
  unrelated error; `parameter_size` parsing; schema sanitizing; message
  mapping; preflight success/failure (httpx mocked).
- **Factory/config:** missing and unknown `ai_provider` → Google; URL
  normalization; config GET/PATCH with the new fields.
- **Models endpoint:** success, sorting, `is_small`, unreachable → 502, empty
  URL → 422.
- **Unavailability flow:** full run with Ollama down (preflight) → all
  pending, `limit_reason = "unavailable"`, one Telegram alert; a later pass
  still down → no second alert; recovery → one "back online" message; a
  second outage the same day → nothing; alerts without Telegram configured →
  nothing sent, nothing marked.
- **Google regression:** the existing quota, cronjob, daily report and
  offer-check tests keep their assertions; only the key argument becomes a
  provider fixture.
- **Frontend:** `AIProviderSection` (switching, model loading, error, small
  model warning, missing saved model), `GeneralSection` without the key,
  `settingsDraft`, `DailyCheckNotice` by reason; fixtures gain the new config
  fields; check the Settings e2e.
- **Docs:** README's configuration section describes both providers and the
  small-model warning.

## 8. Out of scope

- Per-task model choice (e.g. a different model for extraction vs. price
  check).
- Other providers (OpenAI, Anthropic…); the interface allows adding them
  later as one class each.
- Authentication in front of Ollama (a reverse proxy with credentials).
- Choosing the Gemini model.

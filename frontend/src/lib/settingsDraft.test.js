import { describe, it, expect } from 'vitest';
import {
  draftFromConfig,
  isDraftDirty,
  mergeUpstreamChanges,
  buildConfigPatch
} from './settingsDraft';

const CONFIG = {
  selected_language: 'english',
  analysis_hour: 12,
  hist_window_size: 60,
  google_api_key: 'AIza-key',
  telegram_bot_token: 'bot-token',
  telegram_bot_chat_id: '999',
  is_price_drop_alert: true,
  is_stock_change_alert: false,
  telegram_status: 'connected'
};

describe('draftFromConfig', () => {
  it('picks only the editable fields, defaulting null secrets to empty strings', () => {
    expect(
      draftFromConfig({
        ...CONFIG,
        google_api_key: null,
        telegram_bot_token: null
      })
    ).toEqual({
      selected_language: 'english',
      analysis_hour: 12,
      hist_window_size: 60,
      google_api_key: '',
      telegram_bot_token: '',
      is_price_drop_alert: true,
      is_stock_change_alert: false
    });
  });

  it('never includes telegram_bot_chat_id or telegram_status', () => {
    const draft = draftFromConfig(CONFIG);
    expect(draft).not.toHaveProperty('telegram_bot_chat_id');
    expect(draft).not.toHaveProperty('telegram_status');
  });
});

describe('isDraftDirty', () => {
  it('is false when the draft matches the baseline', () => {
    const baseline = draftFromConfig(CONFIG);
    expect(isDraftDirty({ ...baseline }, baseline)).toBe(false);
  });

  it('is true when any editable field differs', () => {
    const baseline = draftFromConfig(CONFIG);
    expect(isDraftDirty({ ...baseline, analysis_hour: 5 }, baseline)).toBe(
      true
    );
  });
});

describe('mergeUpstreamChanges', () => {
  it('adopts the new baseline for fields the draft never touched', () => {
    const prevBaseline = draftFromConfig(CONFIG);
    const nextBaseline = draftFromConfig({
      ...CONFIG,
      hist_window_size: 90
    });

    const merged = mergeUpstreamChanges(
      { ...prevBaseline },
      prevBaseline,
      nextBaseline
    );

    expect(merged.hist_window_size).toBe(90);
  });

  it('keeps an unsaved edit instead of overwriting it with the new baseline', () => {
    const prevBaseline = draftFromConfig(CONFIG);
    const draft = { ...prevBaseline, google_api_key: 'draft-in-progress' };
    // Upstream refresh changes an unrelated field (telegram token saved,
    // hist window untouched by the user).
    const nextBaseline = draftFromConfig({
      ...CONFIG,
      telegram_bot_token: 'new-bot-token'
    });

    const merged = mergeUpstreamChanges(draft, prevBaseline, nextBaseline);

    // The user's in-progress edit survives the refresh...
    expect(merged.google_api_key).toBe('draft-in-progress');
    // ...while the untouched field picks up the upstream change.
    expect(merged.telegram_bot_token).toBe('new-bot-token');
  });

  it('does not introduce dirtiness on its own: merging into an untouched draft stays clean', () => {
    const prevBaseline = draftFromConfig(CONFIG);
    const nextBaseline = draftFromConfig({
      ...CONFIG,
      telegram_bot_chat_id: '12345'
    });

    const merged = mergeUpstreamChanges(
      { ...prevBaseline },
      prevBaseline,
      nextBaseline
    );

    expect(isDraftDirty(merged, nextBaseline)).toBe(false);
  });
});

describe('buildConfigPatch', () => {
  it('sends an emptied secret as an empty string, not null, so the backend actually clears it', () => {
    // The backend treats a JSON `null` as "field not provided" and leaves
    // the existing secret untouched, so a cleared field must be sent as a
    // real empty string instead.
    const draft = {
      ...draftFromConfig(CONFIG),
      google_api_key: '',
      telegram_bot_token: ''
    };
    const patch = buildConfigPatch(draft);
    expect(patch.google_api_key).toBe('');
    expect(patch.telegram_bot_token).toBe('');
  });

  it('carries the rest of the fields through unchanged', () => {
    const draft = draftFromConfig(CONFIG);
    const patch = buildConfigPatch(draft);
    expect(patch).toEqual({
      selected_language: 'english',
      analysis_hour: 12,
      hist_window_size: 60,
      google_api_key: 'AIza-key',
      telegram_bot_token: 'bot-token',
      is_price_drop_alert: true,
      is_stock_change_alert: false
    });
  });
});

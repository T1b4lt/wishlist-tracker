import { create } from 'zustand';
import { config as configApi } from '@/lib/api';
import i18n, { persistLanguagePreference } from '@/i18n';

/**
 * The store's state before any action has run. Exported so tests can reset
 * the store between cases with `useConfigStore.setState(initialConfigState, true)`.
 */
export const initialConfigState = {
  /** @type {'idle'|'loading'|'success'|'error'} Status of the last `fetch()` call. */
  status: 'idle',
  /** @type {string|null} Error message from the last failed `fetch()` call. */
  error: null,
  /** @type {object|null} `GET /config/` response (includes `telegram_status`). */
  config: null
};

/**
 * Applies a language loaded from (or saved to) the backend config: switches
 * i18next to it and persists it to `localStorage`, so it survives a reload
 * and matches what the config store now considers the source of truth.
 * @param {string|undefined} language
 */
function applyLanguage(language) {
  if (!language) return;
  i18n.changeLanguage(language);
  persistLanguagePreference(language);
}

/**
 * Zustand store for the application configuration, backed by
 * `src/lib/api/config.js`. This is the single source of truth for the UI
 * language: every successful `fetch()` or `save()` applies
 * `config.selected_language` via i18next and persists it, so it is safe to
 * call `fetch()` from every page that needs the config without worrying
 * about issuing duplicate requests (see below).
 */
export const useConfigStore = create((set, get) => ({
  ...initialConfigState,

  /**
   * Load the configuration. Skips the request when it is already loaded
   * (`status === 'success'` and `config` is set) or already in flight
   * (`status === 'loading'`) unless `force` is passed, so every page can call
   * `fetch()` on mount (including twice in a row under React StrictMode's
   * mount/unmount/remount) and only one request actually hits the network.
   * @param {boolean} [force]
   */
  async fetch(force = false) {
    const { status, config } = get();
    if (
      !force &&
      (status === 'loading' || (status === 'success' && config !== null))
    ) {
      return;
    }
    set({ status: 'loading', error: null });
    try {
      const data = await configApi.get();
      set({ status: 'success', error: null, config: data });
      applyLanguage(data.selected_language);
    } catch (err) {
      set({ status: 'error', error: err.message });
    }
  },

  /**
   * Save a partial configuration update, applying the (possibly new)
   * language on success.
   * @param {object} patch
   * @returns {Promise<object>} The updated configuration.
   */
  async save(patch) {
    const data = await configApi.update(patch);
    set({ config: data, status: 'success', error: null });
    applyLanguage(data.selected_language);
    return data;
  }
}));

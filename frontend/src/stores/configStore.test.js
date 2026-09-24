import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config as configApi } from '@/lib/api';
import i18n, { persistLanguagePreference } from '@/i18n';
import { useConfigStore, initialConfigState } from './configStore';

vi.mock('@/lib/api', () => ({
  config: {
    get: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('@/i18n', () => ({
  default: { changeLanguage: vi.fn() },
  persistLanguagePreference: vi.fn()
}));

beforeEach(() => {
  useConfigStore.setState(initialConfigState);
  vi.clearAllMocks();
});

describe('useConfigStore', () => {
  it('starts idle with no config loaded', () => {
    const state = useConfigStore.getState();
    expect(state.status).toBe('idle');
    expect(state.config).toBeNull();
    expect(state.error).toBeNull();
  });

  describe('fetch', () => {
    it('transitions idle -> loading -> success and stores the config', async () => {
      let resolveRequest;
      configApi.get.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
      );

      const promise = useConfigStore.getState().fetch();
      expect(useConfigStore.getState().status).toBe('loading');

      resolveRequest({ selected_language: 'spanish', hist_window_size: 60 });
      await promise;

      const state = useConfigStore.getState();
      expect(state.status).toBe('success');
      expect(state.config).toEqual({
        selected_language: 'spanish',
        hist_window_size: 60
      });
    });

    it('applies and persists the language from the loaded config', async () => {
      configApi.get.mockResolvedValue({ selected_language: 'spanish' });

      await useConfigStore.getState().fetch();

      expect(i18n.changeLanguage).toHaveBeenCalledWith('spanish');
      expect(persistLanguagePreference).toHaveBeenCalledWith('spanish');
    });

    it('transitions to error and keeps the message on failure', async () => {
      configApi.get.mockRejectedValue(new Error('network down'));

      await useConfigStore.getState().fetch();

      const state = useConfigStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('network down');
      expect(i18n.changeLanguage).not.toHaveBeenCalled();
    });

    it('skips the request when already loaded and not forced', async () => {
      configApi.get.mockResolvedValue({ selected_language: 'english' });

      await useConfigStore.getState().fetch();
      await useConfigStore.getState().fetch();

      expect(configApi.get).toHaveBeenCalledTimes(1);
    });

    it('skips a second call while the first request is still in flight', async () => {
      let resolveRequest;
      configApi.get.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
      );

      const first = useConfigStore.getState().fetch();
      const second = useConfigStore.getState().fetch();
      resolveRequest({ selected_language: 'english' });
      await Promise.all([first, second]);

      expect(configApi.get).toHaveBeenCalledTimes(1);
    });

    it('refetches when force is true even if already loaded', async () => {
      configApi.get.mockResolvedValue({ selected_language: 'english' });

      await useConfigStore.getState().fetch();
      await useConfigStore.getState().fetch(true);

      expect(configApi.get).toHaveBeenCalledTimes(2);
    });

    it('retries the request after a previous failure', async () => {
      configApi.get.mockRejectedValueOnce(new Error('boom'));
      configApi.get.mockResolvedValueOnce({ selected_language: 'english' });

      await useConfigStore.getState().fetch();
      await useConfigStore.getState().fetch();

      expect(configApi.get).toHaveBeenCalledTimes(2);
      expect(useConfigStore.getState().status).toBe('success');
    });
  });

  describe('save', () => {
    it('saves the patch, stores the response and applies the language', async () => {
      configApi.update.mockResolvedValue({
        selected_language: 'spanish',
        analysis_hour: 5
      });

      const result = await useConfigStore.getState().save({ analysis_hour: 5 });

      expect(configApi.update).toHaveBeenCalledWith({ analysis_hour: 5 });
      expect(result).toEqual({
        selected_language: 'spanish',
        analysis_hour: 5
      });
      expect(useConfigStore.getState().config).toEqual(result);
      expect(useConfigStore.getState().status).toBe('success');
      expect(i18n.changeLanguage).toHaveBeenCalledWith('spanish');
      expect(persistLanguagePreference).toHaveBeenCalledWith('spanish');
    });

    it('propagates the error without touching state on failure', async () => {
      configApi.update.mockRejectedValue(new Error('invalid patch'));

      await expect(
        useConfigStore.getState().save({ analysis_hour: 99 })
      ).rejects.toThrow('invalid patch');
      expect(useConfigStore.getState().config).toBeNull();
      expect(i18n.changeLanguage).not.toHaveBeenCalled();
    });
  });
});

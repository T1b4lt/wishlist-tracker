import { useCallback, useEffect, useState } from 'react';
import { ai as aiApi } from '@/lib/api';

const IDLE = { status: 'idle', models: [], threshold: null, error: null };

/**
 * Loads the models of the Ollama instance at `url` from the backend,
 * debounced while the user types. The result is keyed by the request
 * (URL + refresh count), so the status is derived during render instead of
 * being reset from the effect: a result for an older URL reads as
 * `loading` until the new one arrives.
 *
 * @param {string} url - The draft Ollama URL.
 * @param {object} [options]
 * @param {boolean} [options.enabled] - Only load while Ollama is selected.
 * @param {number} [options.delayMs] - Debounce delay (0 in tests).
 * @returns {{status: 'idle'|'loading'|'success'|'error', models: object[],
 *   threshold: number|null, error: string|null, refresh: () => void}}
 */
export function useOllamaModels(url, { enabled = true, delayMs = 600 } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, ...IDLE });
  const trimmed = url.trim();
  const key = enabled && trimmed ? `${trimmed}#${attempt}` : null;
  const refresh = useCallback(() => setAttempt((count) => count + 1), []);

  useEffect(() => {
    if (key === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await aiApi.listOllamaModels(trimmed, controller.signal);
        setResult({
          key,
          status: 'success',
          models: data.models,
          threshold: data.small_model_threshold_b,
          error: null
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({ key, ...IDLE, status: 'error', error: error.message });
      }
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, trimmed, delayMs]);

  if (key === null) return { ...IDLE, refresh };
  if (result.key !== key) return { ...IDLE, status: 'loading', refresh };
  return { ...result, refresh };
}

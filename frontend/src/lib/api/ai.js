import { request } from './client';

/**
 * List the models installed on an Ollama instance
 * (`GET /ai/ollama/models`). The backend normalizes the URL and decides
 * which models are small.
 * @param {string} url - The instance URL as typed.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{models: object[], small_model_threshold_b: number}>}
 */
export const listOllamaModels = (url, signal) =>
  request(`/ai/ollama/models?url=${encodeURIComponent(url)}`, { signal });

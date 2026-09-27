import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ai as aiApi } from '@/lib/api';
import { useOllamaModels } from './useOllamaModels';

vi.mock('@/lib/api', () => ({ ai: { listOllamaModels: vi.fn() } }));

const RESPONSE = {
  models: [
    { name: 'qwen3.8:latest', parameter_size: '27.3B', is_small: false }
  ],
  small_model_threshold_b: 20
};

beforeEach(() => vi.clearAllMocks());

describe('useOllamaModels', () => {
  it('is idle without a URL', () => {
    const { result } = renderHook(() => useOllamaModels('  ', { delayMs: 0 }));
    expect(result.current.status).toBe('idle');
    expect(aiApi.listOllamaModels).not.toHaveBeenCalled();
  });

  it('is idle while disabled', () => {
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { enabled: false, delayMs: 0 })
    );
    expect(result.current.status).toBe('idle');
  });

  it('loads the models of the URL', async () => {
    aiApi.listOllamaModels.mockResolvedValue(RESPONSE);
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { delayMs: 0 })
    );
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.models).toEqual(RESPONSE.models);
    expect(result.current.threshold).toBe(20);
    expect(aiApi.listOllamaModels).toHaveBeenCalledWith(
      'http://h:11434',
      expect.any(AbortSignal)
    );
  });

  it('reports the backend error', async () => {
    aiApi.listOllamaModels.mockRejectedValue(
      new Error('Could not reach Ollama')
    );
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { delayMs: 0 })
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not reach Ollama');
  });

  it('reloads on refresh', async () => {
    aiApi.listOllamaModels.mockResolvedValue(RESPONSE);
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { delayMs: 0 })
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(aiApi.listOllamaModels).toHaveBeenCalledTimes(2)
    );
  });
});

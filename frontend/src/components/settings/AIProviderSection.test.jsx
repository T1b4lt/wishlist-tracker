import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ai as aiApi } from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AIProviderSection } from './AIProviderSection';

vi.mock('@/lib/api', () => ({ ai: { listOllamaModels: vi.fn() } }));

// No test here opens the model `Select` (see `ProductPage.edit.test.jsx` for
// why Ark dismissable layers are opened at most once per test file).

const MODELS = {
  models: [
    {
      name: 'gemma4:e4b',
      parameter_size: '8.0B',
      parameter_billions: 8,
      is_small: true
    },
    {
      name: 'qwen3.8:latest',
      parameter_size: '27.3B',
      parameter_billions: 27.3,
      is_small: false
    }
  ],
  small_model_threshold_b: 20
};

const baseProps = {
  provider: 'google_ai_studio',
  onProviderChange: vi.fn(),
  providerOptions: ['google_ai_studio', 'ollama'],
  googleApiKey: '',
  onGoogleApiKeyChange: vi.fn(),
  savedGoogleApiKey: '',
  ollamaUrl: '',
  onOllamaUrlChange: vi.fn(),
  ollamaModel: '',
  onOllamaModelChange: vi.fn(),
  modelsDelayMs: 0
};

const renderSection = (props) =>
  renderWithProviders(<AIProviderSection {...baseProps} {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
  aiApi.listOllamaModels.mockResolvedValue(MODELS);
});

describe('AIProviderSection', () => {
  it('shows the Google API key for Google AI Studio', () => {
    renderSection();
    expect(
      screen.getByLabelText('Google AI Studio API key')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Ollama URL')).not.toBeInTheDocument();
    expect(aiApi.listOllamaModels).not.toHaveBeenCalled();
  });

  it('switches the provider', async () => {
    const user = userEvent.setup();
    const onProviderChange = vi.fn();
    renderSection({ onProviderChange });
    await user.click(screen.getAllByText('Ollama')[0]);
    expect(onProviderChange).toHaveBeenCalledWith('ollama');
  });

  it('asks for the URL before listing models', () => {
    renderSection({ provider: 'ollama' });
    expect(screen.getByLabelText('Ollama URL')).toBeInTheDocument();
    expect(
      screen.getByText('Enter the Ollama URL to list its models')
    ).toBeInTheDocument();
  });

  it('updates the URL as the user types', async () => {
    const user = userEvent.setup();
    const onOllamaUrlChange = vi.fn();
    renderSection({ provider: 'ollama', onOllamaUrlChange });
    await user.type(screen.getByLabelText('Ollama URL'), 'h');
    expect(onOllamaUrlChange).toHaveBeenCalledWith('h');
  });

  it('warns when the selected model is small', async () => {
    renderSection({
      provider: 'ollama',
      ollamaUrl: 'http://h:11434',
      ollamaModel: 'gemma4:e4b'
    });
    expect(
      await screen.findByText(/Models under 20B parameters/)
    ).toBeInTheDocument();
  });

  it('does not warn for a big model', async () => {
    renderSection({
      provider: 'ollama',
      ollamaUrl: 'http://h:11434',
      ollamaModel: 'qwen3.8:latest'
    });
    await waitFor(() => expect(aiApi.listOllamaModels).toHaveBeenCalled());
    expect(
      screen.queryByText(/Models under 20B parameters/)
    ).not.toBeInTheDocument();
  });

  it('keeps a saved model missing from the instance', async () => {
    renderSection({
      provider: 'ollama',
      ollamaUrl: 'http://h:11434',
      ollamaModel: 'old:latest'
    });
    // Shown by the select's value text (and its hidden native option).
    expect(
      (await screen.findAllByText('old:latest (not available)')).length
    ).toBeGreaterThan(0);
  });

  it('shows the error when the instance cannot be reached', async () => {
    aiApi.listOllamaModels.mockRejectedValue(
      new Error('Could not reach Ollama at http://h:11434')
    );
    renderSection({ provider: 'ollama', ollamaUrl: 'http://h:11434' });
    expect(
      await screen.findByText(
        'Could not load the models: Could not reach Ollama at http://h:11434'
      )
    ).toBeInTheDocument();
  });

  it('reloads the models on demand', async () => {
    const user = userEvent.setup();
    renderSection({ provider: 'ollama', ollamaUrl: 'http://h:11434' });
    await waitFor(() =>
      expect(aiApi.listOllamaModels).toHaveBeenCalledTimes(1)
    );
    await user.click(screen.getByRole('button', { name: 'Reload models' }));
    await waitFor(() =>
      expect(aiApi.listOllamaModels).toHaveBeenCalledTimes(2)
    );
  });
});

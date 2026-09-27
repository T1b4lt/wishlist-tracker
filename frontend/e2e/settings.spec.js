import { test, expect } from './support/fixtures';
import { CONFIG_CONNECTED, CONFIG_NOT_CONFIGURED } from './fixtures/config';

test.describe('Settings', () => {
  test('saves the daily check report mode', async ({ page, apiMock }) => {
    apiMock.setConfig(CONFIG_CONNECTED);
    apiMock.setCategories([]);
    apiMock.setProducts([]);
    await page.goto('/settings');

    await page.getByRole('combobox', { name: 'Daily check report' }).click();
    await page.getByRole('option', { name: 'Every day' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => apiMock.config.daily_check_report)
      .toBe('every_day');
  });

  test('the save bar appears only while the form is dirty, and discard resets it', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([]);
    apiMock.setProducts([]);

    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 })
    ).toBeVisible();

    const saveButton = page.getByRole('button', { name: 'Save' });
    const discardButton = page.getByRole('button', { name: 'Discard' });
    await expect(saveButton).toBeHidden();

    const analysisHour = page.getByRole('combobox', { name: 'Analysis hour' });
    await analysisHour.click();
    await page.getByRole('option', { name: '14:00' }).click();

    await expect(saveButton).toBeVisible();
    await expect(discardButton).toBeVisible();

    await discardButton.click();
    await expect(saveButton).toBeHidden();
    await expect(analysisHour).toHaveText('12:00');
  });

  test('applies the selected language immediately after saving', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([]);
    apiMock.setProducts([]);

    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 })
    ).toBeVisible();

    await page.getByRole('combobox', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'Spanish' }).click();

    // Selecting a new language only updates the draft: the UI (and this
    // dirty state) must still be in English until the save actually
    // succeeds (`configStore.js`'s `applyLanguage` only runs after `PATCH
    // /config/` resolves).
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).click();

    // The whole UI, including the save-success toast's own text, switches
    // to Spanish immediately: the toast is built from `i18n.t` (which
    // always reads the live language), not the render-scoped `t` (a fixed
    // snapshot of whichever language was active before this save), so it
    // never lags behind a language-changing save (see
    // `SettingsPage.jsx`'s `handleSave`).
    await expect(page.getByText('Ajustes guardados')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'Ajustes', level: 1 })
    ).toBeVisible();
    await expect(page.getByText('Idioma')).toBeVisible();

    // The choice survives a reload (persisted to `localStorage` and applied
    // again once the freshly-fetched config resolves to the same language).
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Ajustes', level: 1 })
    ).toBeVisible();
  });

  test('saves Ollama as the AI provider', async ({
    page,
    apiMock
  }, testInfo) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([]);
    apiMock.setProducts([]);
    apiMock.setOllamaModels({
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
    });
    await page.goto('/settings');

    // The provider is a segmented control from `sm` up and a select below.
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('combobox', { name: 'Provider' }).click();
      await page.getByRole('option', { name: 'Ollama' }).click();
    } else {
      await page
        .getByText('Ollama', { exact: true })
        .filter({ visible: true })
        .click();
    }
    await page.getByLabel('Ollama URL').fill('192.168.1.20:11434');
    await page.getByRole('combobox', { name: 'Model' }).click();
    await page.getByRole('option', { name: 'gemma4:e4b · 8.0B' }).click();
    await expect(page.getByText(/Models under 20B parameters/)).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => apiMock.config.ai_provider).toBe('ollama');
    expect(apiMock.config.ollama_url).toBe('192.168.1.20:11434');
    expect(apiMock.config.ollama_model).toBe('gemma4:e4b');
  });
});

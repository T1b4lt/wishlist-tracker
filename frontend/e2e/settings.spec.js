import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';

test.describe('Settings', () => {
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
});

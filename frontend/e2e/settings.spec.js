import { test, expect } from '@playwright/test';
import { ApiMock } from './support/apiMock';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';

test.describe('Settings', () => {
  test('the save bar appears only while the form is dirty, and discard resets it', async ({
    page
  }) => {
    const api = new ApiMock(page);
    api.setConfig(CONFIG_NOT_CONFIGURED);
    api.setCategories([]);
    api.setProducts([]);
    await api.install();

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
    page
  }) => {
    const api = new ApiMock(page);
    api.setConfig(CONFIG_NOT_CONFIGURED);
    api.setCategories([]);
    api.setProducts([]);
    await api.install();

    await page.goto('/settings');

    await page.getByRole('combobox', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'Spanish' }).click();

    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();

    // The rest of the UI (including the save bar disappearing, confirming
    // the save itself completed) switches to Spanish immediately. The
    // save-success toast's own text is a known, pre-existing exception (see
    // the task report): react-i18next's `t` is a `getFixedT` snapshot bound
    // to whichever language was active at the last render, so the toast
    // created right after this save can still read the previous language.
    // Intentionally not asserted on here.
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

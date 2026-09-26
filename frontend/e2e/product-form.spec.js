import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildDashboardProduct, buildProductDetail } from './fixtures/products';

test.describe('Add / edit product', () => {
  test('adds a product via a mocked URL extraction', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts([]);
    apiMock.setExtraction({
      name: 'Mechanical Keyboard',
      category: 'Electronics',
      description: 'A tactile mechanical keyboard.',
      currency: 'usd'
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Add product' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Add product' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Product URL').fill('https://example.com/keyboard');

    // The 500ms-debounced auto-extraction fills the rest of the form.
    await expect(dialog.getByLabel('Item name')).toHaveValue(
      'Mechanical Keyboard',
      {
        timeout: 5000
      }
    );
    await expect(dialog.getByLabel('Description')).toHaveValue(
      'A tactile mechanical keyboard.'
    );
    await expect(dialog.getByRole('combobox', { name: 'Category' })).toHaveText(
      'Electronics'
    );
    await expect(
      dialog.getByRole('combobox', { name: 'Currency' })
    ).toHaveValue('USD · $');

    await dialog.getByRole('button', { name: 'Add product' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Product added')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Mechanical Keyboard' })
    ).toBeVisible();
  });

  test('shows validation errors and lets the user fill the form manually', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts([]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Add product' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Add product' });
    await dialog.getByRole('button', { name: 'Add product' }).click();

    await expect(dialog.getByText('Enter a product URL.')).toBeVisible();
    await expect(dialog.getByText('Enter a name.')).toBeVisible();
    await expect(dialog.getByText('Select a category.')).toBeVisible();
  });

  test('edits an existing product', async ({ page, apiMock }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    const product = buildDashboardProduct({
      id: 1,
      name: 'Wireless Headphones'
    });
    apiMock.setProducts([product]);
    apiMock.setDetail(
      1,
      buildProductDetail({ id: 1, name: 'Wireless Headphones' })
    );

    await page.goto('/');
    await page
      .getByRole('button', { name: 'Actions for Wireless Headphones' })
      .click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Item name')).toHaveValue(
      'Wireless Headphones'
    );

    await dialog.getByLabel('Item name').fill('Wireless Headphones Pro');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Product updated')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Wireless Headphones Pro' })
    ).toBeVisible();
  });
});

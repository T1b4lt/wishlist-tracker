import { test, expect } from '@playwright/test';
import { ApiMock } from './support/apiMock';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildDashboardProduct, buildProductDetail } from './fixtures/products';

test.describe('Delete product', () => {
  test('deletes a product from the dashboard after confirming', async ({
    page
  }) => {
    const api = new ApiMock(page);
    api.setConfig(CONFIG_NOT_CONFIGURED);
    api.setCategories(CATEGORIES_BASIC);
    api.setProducts([
      buildDashboardProduct({ id: 1, name: 'Wireless Headphones' }),
      buildDashboardProduct({
        id: 2,
        name: 'Standing Desk',
        category_id: 2,
        category_name: 'Books'
      })
    ]);
    await api.install();

    await page.goto('/');

    await page
      .getByRole('button', { name: 'Actions for Wireless Headphones' })
      .click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete product' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Wireless Headphones')).toBeVisible();

    // Cancel first: the product must still be there.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('link', { name: 'Wireless Headphones' })
    ).toBeVisible();

    // Now actually delete it.
    await page
      .getByRole('button', { name: 'Actions for Wireless Headphones' })
      .click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Product deleted')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Wireless Headphones' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Standing Desk' })
    ).toBeVisible();
  });

  test('deletes a product from its detail page and returns to the dashboard', async ({
    page
  }) => {
    const api = new ApiMock(page);
    api.setConfig(CONFIG_NOT_CONFIGURED);
    api.setCategories(CATEGORIES_BASIC);
    const product = buildDashboardProduct({
      id: 1,
      name: 'Wireless Headphones'
    });
    api.setProducts([product]);
    api.setDetail(
      1,
      buildProductDetail({ id: 1, name: 'Wireless Headphones' })
    );
    await api.install();

    await page.goto('/product/1');
    await expect(
      page.getByRole('heading', { name: 'Wireless Headphones', level: 1 })
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'More actions for Wireless Headphones' })
      .click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete product' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Product deleted')).toBeVisible();
  });
});

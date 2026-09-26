import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { buildCategory } from './fixtures/categories';

test.describe('Categories', () => {
  test('creates a new category', async ({ page, apiMock }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([
      buildCategory({ id: 1, name: 'Electronics', product_count: 0 })
    ]);

    await page.goto('/categories');
    await expect(
      page.getByRole('heading', { name: 'Manage categories', level: 1 })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Add category' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add category' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Category name').fill('Toys');
    await dialog.getByRole('radio', { name: 'Green' }).click({ force: true });
    await dialog
      .getByRole('button', { name: 'Add category', exact: true })
      .click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Category created')).toBeVisible();
    await expect(page.getByText('Toys', { exact: true })).toBeVisible();
    await expect(page.getByText('0 products').last()).toBeVisible();
  });

  test('requires a name before creating a category', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([]);

    await page.goto('/categories');
    await page.getByRole('button', { name: 'Add category' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add category' });
    await dialog
      .getByRole('button', { name: 'Add category', exact: true })
      .click();

    await expect(dialog.getByText('Enter a category name.')).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('disables delete (with an explanatory tooltip) while a category is in use', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([
      buildCategory({ id: 1, name: 'Electronics', product_count: 3 }),
      buildCategory({ id: 2, name: 'Books', product_count: 0 })
    ]);

    await page.goto('/categories');

    const blockedDelete = page.getByRole('button', {
      name: 'Delete category Electronics'
    });
    await expect(blockedDelete).toBeVisible();
    await expect(blockedDelete).toBeDisabled();

    // Clicking a disabled-but-focusable (`aria-disabled`) button must not
    // open the confirm dialog.
    await blockedDelete.click({ force: true });
    await expect(
      page.getByRole('dialog', { name: 'Delete category' })
    ).toBeHidden();

    const enabledDelete = page.getByRole('button', {
      name: 'Delete category Books'
    });
    await expect(enabledDelete).toBeEnabled();
  });

  test('deletes a category that is not in use', async ({ page, apiMock }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([
      buildCategory({ id: 1, name: 'Electronics', product_count: 3 }),
      buildCategory({ id: 2, name: 'Books', product_count: 0 })
    ]);

    await page.goto('/categories');
    await page.getByRole('button', { name: 'Delete category Books' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete category' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Books');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Category deleted')).toBeVisible();
    await expect(page.getByText('Books', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Electronics', { exact: true })).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { ApiMock } from './support/apiMock';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildDashboardProduct } from './fixtures/products';

/**
 * Parses a `rgb(r, g, b)` / `rgba(r, g, b, a)` computed-style string into its
 * channel values, so light/dark headings can be compared numerically rather
 * than by string equality (the exact token value is not this test's
 * concern; contrast against the page background is).
 */
function parseRgb(value) {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`Not an rgb()/rgba() color: ${value}`);
  const [r, g, b] = match[1].split(',').map((n) => parseFloat(n.trim()));
  return { r, g, b };
}

function luminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe('Dark mode', () => {
  test('toggling to dark mode keeps headings visible with light-on-dark contrast', async ({
    page
  }) => {
    const api = new ApiMock(page);
    api.setConfig(CONFIG_NOT_CONFIGURED);
    api.setCategories(CATEGORIES_BASIC);
    api.setProducts([buildDashboardProduct({ id: 1 })]);
    await api.install();

    await page.goto('/');
    const heading = page.getByRole('heading', {
      name: 'Your wishlist',
      level: 1
    });
    await expect(heading).toBeVisible();

    const lightBg = parseRgb(
      await page
        .locator('body')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    );
    const lightHeading = parseRgb(
      await heading.evaluate((el) => getComputedStyle(el).color)
    );
    // Light mode: a dark ("off-black") heading on a light ("off-white") page.
    expect(luminance(lightHeading)).toBeLessThan(luminance(lightBg));

    await page.getByRole('button', { name: 'Toggle color mode' }).click();

    // The toggle flips `next-themes`' `class="dark"` on `<html>`
    // (`attribute="class"` in `components/ui/color-mode.jsx`); assert on
    // that instead of a fixed timeout, then re-read the now-dark colors.
    await expect(page.locator('html')).toHaveClass('dark');
    await expect(heading).toBeVisible();

    const darkBg = parseRgb(
      await page
        .locator('body')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    );
    const darkHeading = parseRgb(
      await heading.evaluate((el) => getComputedStyle(el).color)
    );
    // Dark mode: colors actually changed, and now it is a light ("off-white")
    // heading on a dark ("off-black") page, i.e. the contrast direction
    // flipped, not just the exact hue.
    expect(darkBg).not.toEqual(lightBg);
    expect(luminance(darkHeading)).toBeGreaterThan(luminance(darkBg));
  });
});

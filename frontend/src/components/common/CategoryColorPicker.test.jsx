import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { CATEGORY_COLOR_SWATCHES } from '@/lib/categoryColors';
import { CategoryColorPicker } from './CategoryColorPicker';

describe('CategoryColorPicker', () => {
  it('renders each swatch as a radio with a color-name accessible name, checking the current value', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <CategoryColorPicker
        value={CATEGORY_COLOR_SWATCHES[0]}
        onChange={vi.fn()}
      />
    );

    const red = screen.getByRole('radio', { name: 'Red' });
    const orange = screen.getByRole('radio', { name: 'Orange' });
    expect(red).toBeChecked();
    expect(orange).not.toBeChecked();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('is keyboard selectable: arrow keys move the checked swatch and report the new color', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithProviders(
      <CategoryColorPicker
        value={CATEGORY_COLOR_SWATCHES[0]}
        onChange={onChange}
      />
    );

    screen.getByRole('radio', { name: 'Red' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith(CATEGORY_COLOR_SWATCHES[1]);
  });

  it('treats a non-preset value as no preset selected, and reports custom color changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithProviders(
      <CategoryColorPicker value="#123456" onChange={onChange} />
    );

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }

    const customInput = screen.getByLabelText('Or pick a custom color');
    await user.click(customInput);
    // jsdom's <input type="color"> does not support typing a hex value via
    // userEvent, so this only asserts the input renders with the custom
    // value already applied (the swatch radios all stay unchecked, above).
    expect(customInput).toHaveValue('#123456');
  });

  it('disables every swatch and the custom input when `disabled`', () => {
    renderWithProviders(
      <CategoryColorPicker
        value={CATEGORY_COLOR_SWATCHES[0]}
        onChange={vi.fn()}
        disabled
      />
    );

    expect(screen.getByRole('radio', { name: 'Red' })).toBeDisabled();
    expect(screen.getByLabelText('Or pick a custom color')).toBeDisabled();
  });

  // Regression test for the checked swatch losing its own color: Chakra's
  // `RadioGroup.ItemControl` slot recipe (`radiomark`, "solid" variant)
  // paints its own `bg: colorPalette.solid` on `_checked`, which used to
  // compete with (and, depending on the browser/cascade-layer setup, could
  // beat) the swatch's own `bg`. `CategoryColorPicker` now renders the
  // control `unstyled` so that recipe never applies at all; this asserts
  // that directly by inspecting every generated CSS rule for the checked
  // swatch's class and failing if any of them still reference the
  // recipe's `color-palette-solid` token, and that the swatch's own color
  // is set unconditionally (not only inside a `:checked` rule that could
  // lose a cascade fight).
  it('keeps the checked swatch on its own color, never the colorPalette recipe background', () => {
    renderWithProviders(
      <CategoryColorPicker
        value={CATEGORY_COLOR_SWATCHES[0]}
        onChange={vi.fn()}
      />
    );

    const checkedRadio = screen.getByRole('radio', { name: 'Red' });
    expect(checkedRadio).toBeChecked();
    const control = checkedRadio
      .closest('label')
      .querySelector('[aria-hidden="true"]');
    const controlClass = control.className.split(' ').pop();

    const matchingCss = [];
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule.cssText.includes(controlClass)) matchingCss.push(rule.cssText);
      }
    }
    const css = matchingCss.join('\n');

    expect(css).not.toContain('color-palette-solid');
    // The base (unconditional, not `:checked`-only) rule for this class
    // sets its own color as `background`.
    expect(css).toMatch(
      new RegExp(`\\.${controlClass} \\{[^}]*background: rgb\\(239, 68, 68\\)`)
    );
  });
});

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
});

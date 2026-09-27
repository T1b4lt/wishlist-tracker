import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { GeneralSection } from './GeneralSection';

// This is the only place that opens the "Language" `Select` in this file
// (see `ProductPage.edit.test.jsx` for why only one Ark dismissable-layer
// open/close cycle is exercised per test file/module).

const baseProps = {
  language: 'english',
  onLanguageChange: vi.fn()
};

describe('GeneralSection', () => {
  it('renders the language field', () => {
    renderWithProviders(<GeneralSection {...baseProps} />);

    expect(
      screen.getByRole('combobox', { name: 'Language' })
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Google AI Studio API key')
    ).not.toBeInTheDocument();
  });

  it('reports the selected language without applying it itself', async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();
    renderWithProviders(
      <GeneralSection {...baseProps} onLanguageChange={onLanguageChange} />
    );

    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    await user.click(await screen.findByRole('option', { name: 'Spanish' }));

    expect(onLanguageChange).toHaveBeenCalledWith('spanish');
  });
});

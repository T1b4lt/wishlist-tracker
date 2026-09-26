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
  onLanguageChange: vi.fn(),
  googleApiKey: '',
  onGoogleApiKeyChange: vi.fn(),
  savedGoogleApiKey: ''
};

describe('GeneralSection', () => {
  it('renders the language and Google API key fields', () => {
    renderWithProviders(<GeneralSection {...baseProps} />);

    expect(
      screen.getByRole('combobox', { name: 'Language' })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Google AI Studio API key')
    ).toBeInTheDocument();
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

  it('calls onGoogleApiKeyChange as the user types', async () => {
    const user = userEvent.setup();
    const onGoogleApiKeyChange = vi.fn();
    renderWithProviders(
      <GeneralSection
        {...baseProps}
        onGoogleApiKeyChange={onGoogleApiKeyChange}
      />
    );

    await user.type(screen.getByLabelText('Google AI Studio API key'), 'x');

    expect(onGoogleApiKeyChange).toHaveBeenCalled();
  });
});

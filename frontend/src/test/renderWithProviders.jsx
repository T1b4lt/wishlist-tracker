import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from '@/components/ui/provider';
import i18n from '@/i18n/index.js';

/**
 * Render a component wrapped in the Chakra UI provider and the i18n
 * instance used by the app, for component tests.
 *
 * @param {import('react').ReactNode} ui - The component tree to render.
 * @param {object} [options] - Extra options forwarded to Testing Library's `render`.
 * @returns {import('@testing-library/react').RenderResult} The Testing Library render result.
 */
export function renderWithProviders(ui, options = {}) {
  return render(
    <Provider>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </Provider>,
    options
  );
}

import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { FadeIn } from './FadeIn';

describe('FadeIn', () => {
  it('renders its children', () => {
    renderWithProviders(
      <FadeIn>
        <p>Hello there</p>
      </FadeIn>
    );

    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('does not leak Motion-only props onto the DOM node', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderWithProviders(
      <FadeIn data-testid="fade-in">
        <p>Content</p>
      </FadeIn>
    );

    expect(screen.getByTestId('fade-in').tagName).toBe('DIV');
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

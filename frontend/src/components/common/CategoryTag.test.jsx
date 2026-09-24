import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { CategoryTag } from './CategoryTag';

describe('CategoryTag', () => {
  it('renders the category name', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(<CategoryTag name="Electronics" color="#3366ff" />);

    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });
});

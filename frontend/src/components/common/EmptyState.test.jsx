import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { LuPackagePlus } from 'react-icons/lu';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title, description and action', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    renderWithProviders(
      <EmptyState
        icon={LuPackagePlus}
        title="No products yet"
        description="Add your first product to get started"
        action={<button type="button">Add product</button>}
      />
    );

    expect(screen.getByText('No products yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add your first product to get started')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add product' })
    ).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('renders without a description or action', () => {
    renderWithProviders(<EmptyState title="Nothing here" />);

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});

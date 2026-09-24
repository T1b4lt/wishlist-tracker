import { Table } from '@chakra-ui/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { SkeletonRows } from './SkeletonRows';

describe('SkeletonRows', () => {
  it('renders the requested number of rows and cells, nested validly in a table', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    const { container } = renderWithProviders(
      <Table.Root>
        <Table.Body data-testid="body">
          <SkeletonRows rows={3} columns={4} />
        </Table.Body>
      </Table.Root>
    );

    const rows = container.querySelectorAll('tbody > tr');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row.querySelectorAll('td')).toHaveLength(4);
    });
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('defaults to 5 rows and 5 columns', () => {
    const { container } = renderWithProviders(
      <Table.Root>
        <Table.Body>
          <SkeletonRows />
        </Table.Body>
      </Table.Root>
    );

    expect(container.querySelectorAll('tbody > tr')).toHaveLength(5);
    expect(
      container.querySelectorAll('tbody > tr:first-child > td')
    ).toHaveLength(5);
  });
});

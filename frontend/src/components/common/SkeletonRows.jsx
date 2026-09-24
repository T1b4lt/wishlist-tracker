import { Skeleton, Table } from '@chakra-ui/react';

/**
 * Placeholder `Table.Row`s for a table's loading state. Renders raw rows (no
 * wrapping element) so it can be dropped straight inside a `<Table.Body>`
 * alongside the real rows once they arrive; valid table nesting rules out
 * wrapping the rows in a `div` or similar, so give the surrounding
 * `<Table.Root>` `aria-busy="true"` if a loading announcement is needed.
 *
 * @param {object} props
 * @param {number} [props.rows] - Number of placeholder rows. Defaults to `5`.
 * @param {number} [props.columns] - Number of placeholder cells per row.
 *   Defaults to `5`.
 */
export const SkeletonRows = ({ rows = 5, columns = 5 }) => (
  <>
    {Array.from({ length: rows }, (_, rowIndex) => (
      <Table.Row key={rowIndex}>
        {Array.from({ length: columns }, (__, columnIndex) => (
          <Table.Cell key={columnIndex}>
            <Skeleton height="4" />
          </Table.Cell>
        ))}
      </Table.Row>
    ))}
  </>
);

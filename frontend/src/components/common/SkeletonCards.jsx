import { Card, Skeleton, SimpleGrid, Stack } from '@chakra-ui/react';

/**
 * Placeholder cards for a card grid's loading state.
 *
 * @param {object} props
 * @param {number} [props.count] - Number of placeholder cards. Defaults to `6`.
 * @param {import('@chakra-ui/react').SimpleGridProps['columns']} [props.columns] -
 *   Responsive column count, forwarded to the underlying `SimpleGrid`.
 *   Defaults to `{ base: 1, sm: 2, lg: 3 }`.
 */
export const SkeletonCards = ({
  count = 6,
  columns = { base: 1, sm: 2, lg: 3 }
}) => (
  <SimpleGrid columns={columns} gap={4} role="status" aria-busy="true">
    {Array.from({ length: count }, (_, index) => (
      <Card.Root key={index} p={4}>
        <Stack gap={3}>
          <Skeleton height="5" width="60%" />
          <Skeleton height="4" width="40%" />
          <Skeleton height="20" />
        </Stack>
      </Card.Root>
    ))}
  </SimpleGrid>
);

import { Box, Heading, VStack } from '@chakra-ui/react';

/**
 * Shared card shell for a Settings section (General, Analysis,
 * Notifications): a titled panel with an `id` the side nav's anchor links
 * jump to. `scrollMarginTop` keeps the heading from landing underneath the
 * sticky header when scrolled to.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.title
 * @param {import('react').ReactNode} props.children
 */
export const SettingsSection = ({ id, title, children }) => (
  <Box
    id={id}
    as="section"
    scrollMarginTop="88px"
    p={6}
    borderRadius="lg"
    borderWidth="1px"
    borderColor="border"
    bg="bg.panel"
  >
    <VStack gap={4} align="stretch">
      <Heading as="h2" textStyle="heading.sm">
        {title}
      </Heading>
      {children}
    </VStack>
  </Box>
);

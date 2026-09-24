import { Box, Flex } from '@chakra-ui/react';
import AppHeader from './AppHeader';
import AppFooter from './AppFooter';

/**
 * App-wide layout: a full-height column with the header, the routed page
 * content (which grows to fill the space) and the footer, so the footer
 * sits at the bottom even on short pages.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - The routed page content.
 */
const AppShell = ({ children }) => {
  return (
    <Flex direction="column" minH="100dvh">
      <AppHeader />
      <Box as="main" flex="1">
        {children}
      </Box>
      <AppFooter />
    </Flex>
  );
};

export default AppShell;

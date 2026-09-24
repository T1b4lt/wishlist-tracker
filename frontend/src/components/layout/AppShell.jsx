import { Box, Flex } from '@chakra-ui/react';
import { AnimatePresence } from 'motion/react';
import { useLocation } from 'wouter';
import { PageTransition } from '@/components/motion';
import AppHeader from './AppHeader';
import AppFooter from './AppFooter';

/**
 * App-wide layout: a full-height column with the header, the routed page
 * content (which grows to fill the space) and the footer, so the footer
 * sits at the bottom even on short pages.
 *
 * The routed page content is animated on route change: `AnimatePresence`
 * is keyed by the current location and wraps `children` in a
 * `PageTransition`. `App` passes the same location to `<Switch location>`
 * so the exiting page keeps rendering its own (previous) route while it
 * animates out, instead of jumping to the new route mid-exit.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - The routed page content (a `Switch`).
 */
const AppShell = ({ children }) => {
  const [location] = useLocation();

  return (
    <Flex direction="column" minH="100dvh">
      <AppHeader />
      <Box as="main" flex="1">
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location}>{children}</PageTransition>
        </AnimatePresence>
      </Box>
      <AppFooter />
    </Flex>
  );
};

export default AppShell;

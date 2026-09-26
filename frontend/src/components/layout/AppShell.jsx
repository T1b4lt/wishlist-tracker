import { useEffect, useRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { AnimatePresence } from 'motion/react';
import { useLocation } from 'wouter';
import { PageTransition } from '@/components/motion';
import { useConfigStore } from '@/stores/configStore';
import AppHeader from './AppHeader';
import AppFooter from './AppFooter';

/**
 * Scrolls the window back to the top once the previous page has finished
 * animating out, i.e. while the page area is empty and before the next page
 * fades in, so the jump is never visible. Always instant (never smooth), so
 * it is equally calm with or without `prefers-reduced-motion`.
 *
 * Skipped when:
 * - the URL carries a `#hash`: the destination asked for a specific anchor,
 *   not the top of the page;
 * - the navigation came from the browser's back/forward buttons
 *   (`popstate` for the same pathname): the browser restores that entry's
 *   own scroll position.
 *
 * @param {string|null} popPathname - The pathname the last `popstate` landed on.
 */
function resetScrollAfterRouteChange(popPathname) {
  if (window.location.hash) return;
  if (popPathname !== null && popPathname === window.location.pathname) {
    return;
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

/**
 * App-wide layout: a full-height column with the header, the routed page
 * content (which grows to fill the space) and the footer, so the footer
 * sits at the bottom even on short pages.
 *
 * The routed page content is animated on route change: `AnimatePresence`
 * is keyed by the current location and wraps `children` in a
 * `PageTransition`. `App` passes the same location to `<Switch location>`
 * so the exiting page keeps rendering its own (previous) route while it
 * animates out, instead of jumping to the new route mid-exit. Once that
 * exit completes, the window scrolls back to the top (see
 * `resetScrollAfterRouteChange`); `wouter` does no scroll management of its
 * own. In-page hash anchors (e.g. the Settings section nav) never change
 * the location key, so they are unaffected.
 *
 * Also loads the app configuration once at startup (`configStore.fetch()`
 * skips duplicate requests), so the backend's saved UI language is applied
 * whichever page the app is opened on, not only on pages that read the
 * config themselves.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - The routed page content (a `Switch`).
 */
const AppShell = ({ children }) => {
  const [location] = useLocation();
  const fetchConfig = useConfigStore((state) => state.fetch);
  // Pathname of the last back/forward navigation, consumed (and cleared)
  // by the next exit completion.
  const popPathnameRef = useRef(null);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    const handlePopState = () => {
      popPathnameRef.current = window.location.pathname;
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleExitComplete = () => {
    resetScrollAfterRouteChange(popPathnameRef.current);
    popPathnameRef.current = null;
  };

  return (
    <Flex direction="column" minH="100dvh">
      <AppHeader />
      <Box as="main" flex="1">
        <AnimatePresence
          mode="wait"
          initial={false}
          onExitComplete={handleExitComplete}
        >
          <PageTransition key={location}>{children}</PageTransition>
        </AnimatePresence>
      </Box>
      <AppFooter />
    </Flex>
  );
};

export default AppShell;

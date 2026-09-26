import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LuMenu,
  LuSun,
  LuMoon,
  LuChartLine,
  LuLayoutDashboard,
  LuSettings
} from 'react-icons/lu';
import { Box, Flex, Icon, IconButton, Text } from '@chakra-ui/react';
import { useColorMode } from '@/components/ui/color-mode';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTrigger
} from '@/components/ui/drawer';
import { useTranslation } from 'react-i18next';

/** Sticky header height, within the 56-64px range required by the spec. */
const HEADER_HEIGHT = '64px';

/**
 * App header: brand on the left (a link home), an inline nav with an active
 * state from `md` up, a drawer-based nav below `md`, and the theme toggle on
 * the right.
 *
 * The mobile drawer closes whenever the location changes, not only from its
 * links' own `onClick`: a navigation confirmed through
 * `useUnsavedChangesGuard` (which stops the original click in the capture
 * phase, so that `onClick` never runs) must close it too.
 */
const AppHeader = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [location] = useLocation();
  // "Adjusting state when a prop changes" (React docs): closes the drawer
  // during the render that sees a new location, without an effect.
  const [drawerLocation, setDrawerLocation] = useState(location);
  if (drawerLocation !== location) {
    setDrawerLocation(location);
    setIsDrawerOpen(false);
  }
  const { colorMode, toggleColorMode } = useColorMode();
  const { t } = useTranslation();

  const navItems = [
    {
      label: t('components.header.nav.wishlist'),
      path: '/',
      icon: LuChartLine
    },
    {
      label: t('components.header.nav.categories'),
      path: '/categories',
      icon: LuLayoutDashboard
    },
    {
      label: t('components.header.nav.settings'),
      path: '/settings',
      icon: LuSettings
    }
  ];

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={10}
      h={HEADER_HEIGHT}
      bg="bg"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <Flex
        h="100%"
        align="center"
        justify="space-between"
        px={{ base: 4, md: 6 }}
      >
        {/* Left side: mobile menu button and brand */}
        <Flex align="center" gap={3}>
          <Box hideFrom="md">
            <DrawerRoot
              open={isDrawerOpen}
              onOpenChange={(e) => setIsDrawerOpen(e.open)}
              placement="start"
            >
              <DrawerBackdrop />
              <DrawerTrigger asChild>
                <IconButton
                  aria-label={t('components.header.openMenu')}
                  variant="ghost"
                  size="md"
                >
                  <Icon as={LuMenu} />
                </IconButton>
              </DrawerTrigger>
              <DrawerContent offset={4}>
                <DrawerHeader>
                  <Text textStyle="heading.sm">
                    {t('components.header.menu')}
                  </Text>
                </DrawerHeader>
                <DrawerCloseTrigger />
                <DrawerBody>
                  <Flex as="nav" direction="column" gap={2}>
                    {navItems.map((item) => {
                      const isActive = location === item.path;
                      return (
                        <Link
                          key={item.path}
                          href={item.path}
                          onClick={() => setIsDrawerOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <Flex
                            align="center"
                            gap={3}
                            px={4}
                            py={3}
                            borderRadius="md"
                            fontWeight={isActive ? 'semibold' : 'normal'}
                            bg={isActive ? 'bg.muted' : 'transparent'}
                            _hover={{ bg: 'bg.muted' }}
                          >
                            <Icon as={item.icon} size="lg" />
                            <Text>{item.label}</Text>
                          </Flex>
                        </Link>
                      );
                    })}
                  </Flex>
                </DrawerBody>
              </DrawerContent>
            </DrawerRoot>
          </Box>

          <Link href="/">
            <Text as="span" textStyle="heading.sm">
              {t('common.appName')}
            </Text>
          </Link>
        </Flex>

        {/* Right side: inline nav (md+) and theme toggle */}
        <Flex align="center" gap={6}>
          <Flex as="nav" align="center" gap={1} hideBelow="md">
            {navItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Box
                    px={3}
                    py={2}
                    textStyle="body"
                    fontWeight={isActive ? 'semibold' : 'medium'}
                    color={isActive ? 'fg' : 'fg.muted'}
                    borderBottomWidth="2px"
                    borderColor={isActive ? 'accent' : 'transparent'}
                    _hover={{ color: 'fg' }}
                  >
                    {item.label}
                  </Box>
                </Link>
              );
            })}
          </Flex>

          <IconButton
            aria-label={t('components.header.toggleColorMode')}
            variant="ghost"
            size="md"
            onClick={toggleColorMode}
          >
            <Icon as={colorMode === 'light' ? LuMoon : LuSun} />
          </IconButton>
        </Flex>
      </Flex>
    </Box>
  );
};

export default AppHeader;

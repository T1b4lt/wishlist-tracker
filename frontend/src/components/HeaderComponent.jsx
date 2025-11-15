import { useState } from 'react';
import { useLocation } from 'wouter';
import { LuMenu, LuSun, LuMoon } from 'react-icons/lu';
import { Box, Flex, IconButton, Text } from '@chakra-ui/react';
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

const HeaderComponent = () => {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { colorMode, toggleColorMode } = useColorMode();

  const navItems = [
    { label: 'Dashboard', path: '/' },
    { label: 'Categories', path: '/categories' },
    { label: 'Settings', path: '/settings' }
  ];

  const handleNavigation = (path) => {
    setLocation(path);
    setOpen(false);
  };

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={10}
      bg={colorMode === 'light' ? 'white' : 'gray.800'}
      borderBottomWidth="1px"
      borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
      px={4}
      py={3}
    >
      <Flex align="center" justify="space-between">
        {/* Left side: Menu button and title */}
        <Flex align="center" gap={3}>
          <DrawerRoot
            open={open}
            onOpenChange={(e) => setOpen(e.open)}
            placement="start"
          >
            <DrawerBackdrop />
            <DrawerTrigger asChild>
              <IconButton aria-label="Open menu" variant="ghost" size="md">
                <LuMenu size={20} />
              </IconButton>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <Text fontSize="xl" fontWeight="bold">
                  Menu
                </Text>
              </DrawerHeader>
              <DrawerCloseTrigger />
              <DrawerBody>
                <Flex direction="column" gap={2}>
                  {navItems.map((item) => (
                    <Box
                      key={item.path}
                      as="button"
                      px={4}
                      py={3}
                      borderRadius="md"
                      textAlign="left"
                      fontWeight={location === item.path ? 'bold' : 'normal'}
                      bg={
                        location === item.path
                          ? colorMode === 'light'
                            ? 'gray.100'
                            : 'gray.700'
                          : 'transparent'
                      }
                      _hover={{
                        bg: colorMode === 'light' ? 'gray.100' : 'gray.700'
                      }}
                      onClick={() => handleNavigation(item.path)}
                    >
                      {item.label}
                    </Box>
                  ))}
                </Flex>
              </DrawerBody>
            </DrawerContent>
          </DrawerRoot>

          <Text fontSize="xl" fontWeight="bold">
            Wishlist Tracker AI
          </Text>
        </Flex>

        {/* Right side: Theme toggle */}
        <IconButton
          aria-label="Toggle color mode"
          variant="ghost"
          size="md"
          onClick={toggleColorMode}
        >
          {colorMode === 'light' ? <LuMoon size={20} /> : <LuSun size={20} />}
        </IconButton>
      </Flex>
    </Box>
  );
};

export default HeaderComponent;

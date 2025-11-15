import { Box, Text, Link } from '@chakra-ui/react';
import { useColorMode } from '@/components/ui/color-mode';

const FooterComponent = () => {
  const { colorMode } = useColorMode();

  return (
    <Box
      as="footer"
      borderTopWidth="1px"
      borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
      py={4}
      textAlign="center"
    >
      <Text
        fontSize="sm"
        color={colorMode === 'light' ? 'gray.600' : 'gray.400'}
      >
        Developed by T1b4lt -{' '}
        <Link
          href="https://github.com/T1b4lt/wishlist-tracker"
          target="_blank"
          rel="noopener noreferrer"
          color={colorMode === 'light' ? 'blue.600' : 'blue.400'}
          _hover={{ textDecoration: 'underline' }}
        >
          Github
        </Link>
      </Text>
    </Box>
  );
};

export default FooterComponent;

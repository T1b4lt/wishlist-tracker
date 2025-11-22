import { Box, Text, Link } from '@chakra-ui/react';
import { useColorMode } from '@/components/ui/color-mode';
import { Trans } from 'react-i18next';

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
        <Trans
          i18nKey="components.footer.credits"
          values={{ author: 'T1b4lt' }}
          components={{
            link: (
              <Link
                href="https://github.com/T1b4lt/wishlist-tracker"
                target="_blank"
                rel="noopener noreferrer"
                color={colorMode === 'light' ? 'blue.600' : 'blue.400'}
                _hover={{ textDecoration: 'underline' }}
              />
            )
          }}
        />
      </Text>
    </Box>
  );
};

export default FooterComponent;

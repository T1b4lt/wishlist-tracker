import { Box, Text, Link } from '@chakra-ui/react';
import { Trans } from 'react-i18next';

/**
 * App footer: attribution line, styled with semantic tokens. Rendered inside
 * `AppShell`, always at the bottom of the viewport.
 */
const AppFooter = () => {
  return (
    <Box
      as="footer"
      borderTopWidth="1px"
      borderColor="border"
      py={4}
      textAlign="center"
    >
      <Text textStyle="caption" color="fg.muted">
        <Trans
          i18nKey="components.footer.credits"
          values={{ author: 'T1b4lt' }}
          components={{
            link: (
              <Link
                href="https://github.com/T1b4lt/wishlist-tracker"
                target="_blank"
                rel="noopener noreferrer"
                color="fg"
                _hover={{ textDecoration: 'underline' }}
              />
            )
          }}
        />
      </Text>
    </Box>
  );
};

export default AppFooter;

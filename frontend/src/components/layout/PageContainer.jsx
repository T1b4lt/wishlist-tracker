import { Container } from '@chakra-ui/react';

/**
 * Shared page-level width and padding. Every page's top-level element
 * renders through this instead of picking its own `maxW`/`padding`.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 */
const PageContainer = ({ children, ...rest }) => {
  return (
    <Container
      maxW="7xl"
      px={{ base: 4, md: 6 }}
      py={{ base: 6, md: 8 }}
      {...rest}
    >
      {children}
    </Container>
  );
};

export default PageContainer;

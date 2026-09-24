import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { Link } from 'wouter';
import { LuArrowLeft } from 'react-icons/lu';

/**
 * Shared page header: a title, an optional description, optional trailing
 * actions and an optional back link. Stacks on mobile, single row on `md+`.
 *
 * @param {object} props
 * @param {string} props.title - Page title, rendered with `textStyle="heading.lg"`.
 * @param {string} [props.description] - Optional supporting text below the title.
 * @param {import('react').ReactNode} [props.actions] - Optional trailing content (e.g. a button).
 * @param {{ href: string, label: string }} [props.backLink] - Optional link rendered above the title.
 */
const PageHeader = ({ title, description, actions, backLink }) => {
  return (
    <Box mb={{ base: 6, md: 8 }}>
      {backLink && (
        <Link href={backLink.href}>
          <Flex
            align="center"
            gap={1}
            mb={3}
            color="fg.muted"
            textStyle="caption"
            fontWeight="medium"
            _hover={{ color: 'fg' }}
          >
            <LuArrowLeft size={14} />
            <Text>{backLink.label}</Text>
          </Flex>
        </Link>
      )}
      <Flex
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'stretch', md: 'center' }}
        justify="space-between"
        gap={4}
      >
        <Box>
          <Heading as="h1" textStyle="heading.lg">
            {title}
          </Heading>
          {description && (
            <Text textStyle="body" color="fg.muted" mt={1}>
              {description}
            </Text>
          )}
        </Box>
        {actions && <Box flexShrink={0}>{actions}</Box>}
      </Flex>
    </Box>
  );
};

export default PageHeader;

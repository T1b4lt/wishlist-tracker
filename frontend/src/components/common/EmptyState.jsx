import { Box, Circle, Heading, Icon, Text, VStack } from '@chakra-ui/react';
import { FadeIn } from '@/components/motion';

/**
 * A centered placeholder for an empty list or section: an icon, a title, an
 * optional description and an optional action (e.g. a "create" button).
 *
 * @param {object} props
 * @param {import('react').ComponentType} [props.icon] - A
 *   `react-icons/lu` icon component. Purely decorative (hidden from screen
 *   readers), since `title` already conveys the state.
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {import('react').ReactNode} [props.action] - e.g. a `Button` that starts
 *   creating the first item.
 * @param {object} [rest] - Forwarded to the outer `VStack`.
 */
export const EmptyState = ({
  icon: StateIcon,
  title,
  description,
  action,
  ...rest
}) => (
  <FadeIn>
    <VStack gap={4} py={12} px={4} textAlign="center" {...rest}>
      {StateIcon && (
        <Circle size="48px" bg="bg.muted" color="fg.muted">
          <Icon as={StateIcon} size="xl" />
        </Circle>
      )}
      <VStack gap={1}>
        <Heading textStyle="heading.sm" color="fg">
          {title}
        </Heading>
        {description && (
          <Text textStyle="body" color="fg.muted">
            {description}
          </Text>
        )}
      </VStack>
      {action && <Box mt={2}>{action}</Box>}
    </VStack>
  </FadeIn>
);

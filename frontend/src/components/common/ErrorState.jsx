import { Button, Circle, Heading, Text, VStack } from '@chakra-ui/react';
import { LuRefreshCw, LuTriangleAlert } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { FadeIn } from '@/components/motion';

/**
 * A centered error placeholder for a failed fetch: an alert icon, a title,
 * an optional message and an optional retry button.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {() => void} [props.onRetry] - When given, renders a
 *   `common.actions.retry` button that calls this on click.
 * @param {object} [rest] - Forwarded to the outer `VStack`.
 */
export const ErrorState = ({ title, message, onRetry, ...rest }) => {
  const { t } = useTranslation();

  return (
    <FadeIn>
      <VStack gap={4} py={12} px={4} textAlign="center" {...rest}>
        <Circle size="48px" bg="bg.muted" color="fg.muted">
          <LuTriangleAlert size={24} aria-hidden="true" />
        </Circle>
        <VStack gap={1}>
          <Heading textStyle="heading.sm" color="fg">
            {title}
          </Heading>
          {message && (
            <Text textStyle="body" color="fg.muted">
              {message}
            </Text>
          )}
        </VStack>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <LuRefreshCw size={16} aria-hidden="true" />
            {t('common.actions.retry')}
          </Button>
        )}
      </VStack>
    </FadeIn>
  );
};

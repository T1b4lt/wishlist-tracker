import { Flex, Spinner, VisuallyHidden } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

/**
 * A centered spinner for a loading section, with an `aria-live` region so
 * assistive tech announces the loading state even though the spinner itself
 * is visual only.
 *
 * @param {object} props
 * @param {string} [props.label] - Announced to screen readers. Defaults to
 *   `common.messages.loading`.
 * @param {string|number} [props.minH] - Minimum height of the centered area.
 *   Defaults to `200px`.
 * @param {object} [rest] - Forwarded to the outer `Flex`.
 */
export const LoadingState = ({ label, minH = '200px', ...rest }) => {
  const { t } = useTranslation();

  return (
    <Flex
      justify="center"
      align="center"
      minH={minH}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <Spinner size="xl" aria-hidden="true" />
      <VisuallyHidden>{label ?? t('common.messages.loading')}</VisuallyHidden>
    </Flex>
  );
};

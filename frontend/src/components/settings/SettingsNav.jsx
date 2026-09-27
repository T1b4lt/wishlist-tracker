import { Box, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

const SECTIONS = [
  { id: 'general', key: 'general' },
  { id: 'ai-provider', key: 'aiProvider' },
  { id: 'analysis', key: 'analysis' },
  { id: 'notifications', key: 'notifications' }
];

/**
 * Sticky side nav for the Settings page, with anchor links jumping to each
 * section. Shown from `md` up only: below that, sections simply stack and
 * this nav is not rendered at all (see the brief).
 */
export const SettingsNav = () => {
  const { t } = useTranslation();

  return (
    <Box
      as="nav"
      aria-label={t('pages.settings.nav.ariaLabel')}
      hideBelow="md"
      position="sticky"
      top="88px"
      alignSelf="start"
    >
      <VStack as="ul" gap={1} align="stretch" listStyleType="none">
        {SECTIONS.map((section) => (
          <Box as="li" key={section.id}>
            <Box
              as="a"
              href={`#${section.id}`}
              display="block"
              px={3}
              py={2}
              borderRadius="md"
              textStyle="body"
              color="fg.muted"
              _hover={{ color: 'fg', bg: 'bg.muted' }}
            >
              {t(`pages.settings.sections.${section.key}`)}
            </Box>
          </Box>
        ))}
      </VStack>
    </Box>
  );
};

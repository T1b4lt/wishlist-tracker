import { Button, Text } from '@chakra-ui/react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { LuSave, LuX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { durationSeconds, easeOut } from '@/theme/motion';
import { MotionFlex } from '@/components/motion';

/**
 * Sticky save bar, fixed to the bottom of the viewport. Visible only while
 * `isDirty`: slides up and fades in when the form becomes dirty, slides out
 * and fades away once it is saved or discarded. Renders as an instant
 * opacity change (no slide) when the user prefers reduced motion.
 *
 * @param {object} props
 * @param {boolean} props.isDirty
 * @param {boolean} [props.isSaving]
 * @param {() => void} props.onSave
 * @param {() => void} props.onDiscard
 */
export const SaveBar = ({ isDirty, isSaving = false, onSave, onDiscard }) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isDirty && (
        <MotionFlex
          key="settings-save-bar"
          aria-live="polite"
          position="fixed"
          bottom={0}
          insetStart={0}
          insetEnd={0}
          zIndex={20}
          justify="center"
          px={4}
          pb={{ base: 4, md: 6 }}
          pt={4}
          pointerEvents="none"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{
            duration: shouldReduceMotion ? 0 : durationSeconds.normal,
            ease: easeOut
          }}
        >
          <MotionFlex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'stretch', sm: 'center' }}
            justify="space-between"
            gap={3}
            w="full"
            maxW="3xl"
            pointerEvents="auto"
            bg="bg.panel"
            borderWidth="1px"
            borderColor="border"
            borderRadius="lg"
            boxShadow="lg"
            px={5}
            py={3}
          >
            <Text
              textStyle="body"
              fontWeight="medium"
              textAlign={{ base: 'center', sm: 'start' }}
            >
              {t('pages.settings.saveBar.unsavedChanges')}
            </Text>
            <MotionFlex gap={3} justify={{ base: 'center', sm: 'flex-end' }}>
              <Button variant="outline" onClick={onDiscard} disabled={isSaving}>
                <LuX size={16} aria-hidden="true" />
                {t('common.actions.discard')}
              </Button>
              <Button onClick={onSave} loading={isSaving}>
                <LuSave size={16} aria-hidden="true" />
                {t('common.actions.save')}
              </Button>
            </MotionFlex>
          </MotionFlex>
        </MotionFlex>
      )}
    </AnimatePresence>
  );
};

import { Badge, Icon } from '@chakra-ui/react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { LuCircleAlert, LuCircleCheck, LuClock } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { durationSeconds, easeOut } from '@/theme/motion';
import { MotionBox } from '@/components/motion';

/** Icon and visual weight for each `telegram_status` value. Deliberately
 * colorless (`gray` palette throughout): status is read from the icon
 * shape, the label and the badge's weight (`connected` is solid, the other
 * two are subtle), never from hue alone. */
const STATUS_VISUALS = {
  not_configured: {
    icon: LuCircleAlert,
    variant: 'subtle',
    i18nKey: 'notConfigured'
  },
  token_only: { icon: LuClock, variant: 'subtle', i18nKey: 'tokenOnly' },
  connected: { icon: LuCircleCheck, variant: 'solid', i18nKey: 'connected' }
};

/**
 * A small status badge for the Telegram integration's connection state
 * (`telegram_status` from `GET /config/`): "Not configured", "Waiting for
 * chat" or "Connected".
 *
 * @param {object} props
 * @param {'not_configured'|'token_only'|'connected'} props.status
 * @param {object} [rest] - Forwarded to the underlying `Badge`.
 */
export const TelegramStatusBadge = ({ status, ...rest }) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const {
    icon: StatusIcon,
    variant,
    i18nKey
  } = STATUS_VISUALS[status] ?? STATUS_VISUALS.not_configured;

  return (
    // Cross-fades between statuses (mirroring `AppShell`'s route-change
    // fade): the old badge fades out, then the new one fades in, instead of
    // the label/icon snapping to the new status instantly.
    <AnimatePresence mode="wait" initial={false}>
      <MotionBox
        key={status}
        display="inline-block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : durationSeconds.fast,
          ease: easeOut
        }}
      >
        <Badge
          variant={variant}
          colorPalette="gray"
          display="inline-flex"
          alignItems="center"
          gap={1}
          {...rest}
        >
          <Icon as={StatusIcon} size="xs" />
          {t(`pages.settings.telegram.status.${i18nKey}`)}
        </Badge>
      </MotionBox>
    </AnimatePresence>
  );
};

import { useState } from 'react';
import {
  Badge,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup
} from '@chakra-ui/react';
import { LuCheck, LuCopy, LuEye, LuEyeOff } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui/field';
import { toaster } from '@/components/ui/toaster';

/**
 * A masked secret field (Google API key, Telegram bot token) with a reveal
 * toggle and a copy-to-clipboard button (disabled while the field is empty;
 * success or failure is reported with a toast). When the draft `value` still matches `savedValue` (a truthy,
 * saved secret the user has not edited), a "Configured" badge is shown next
 * to the label instead of implying the field is empty.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {import('react').ReactNode} [props.helperText]
 * @param {string} props.value - The current draft value (controlled).
 * @param {(value: string) => void} props.onChange
 * @param {string} props.savedValue - The saved config value (`''` when unset).
 * @param {string} [props.placeholder]
 * @param {boolean} [props.disabled]
 * @param {object} [rest] - Forwarded to the underlying `Field`.
 */
export const SecretInput = ({
  label,
  helperText,
  value,
  onChange,
  savedValue,
  placeholder,
  disabled = false,
  ...rest
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const isConfigured = Boolean(savedValue) && value === savedValue;

  const handleCopy = async () => {
    try {
      // `navigator.clipboard` is missing outside secure contexts (plain
      // HTTP on a LAN address): treated the same as a rejected write.
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(value);
      toaster.create({
        title: t('toasts.settings.copySuccess.title'),
        description: t('toasts.settings.copySuccess.description', { label }),
        type: 'success'
      });
    } catch {
      toaster.create({
        title: t('toasts.settings.copyError.title'),
        description: t('toasts.settings.copyError.description'),
        type: 'error'
      });
    }
  };

  return (
    <Field
      label={
        <HStack gap={2}>
          <span>{label}</span>
          {isConfigured && (
            <Badge
              variant="subtle"
              colorPalette="gray"
              display="inline-flex"
              alignItems="center"
              gap={1}
            >
              <Icon as={LuCheck} size="xs" />
              {t('pages.settings.badges.configured')}
            </Badge>
          )}
        </HStack>
      }
      helperText={helperText}
      {...rest}
    >
      <InputGroup
        // Two `sm` icon buttons (reveal + copy) sit at the end of the input,
        // so the element's own padding is tightened and the input reserves
        // their combined width (`pe` below) so typed text never runs under
        // them.
        endElementProps={{ px: 1 }}
        endElement={
          <HStack gap={0}>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={
                isVisible
                  ? t('pages.settings.aria.hideSecret', { label })
                  : t('pages.settings.aria.showSecret', { label })
              }
              onClick={() => setIsVisible((visible) => !visible)}
              disabled={disabled}
            >
              <Icon as={isVisible ? LuEyeOff : LuEye} />
            </IconButton>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t('pages.settings.aria.copySecret', { label })}
              onClick={handleCopy}
              disabled={!value}
            >
              <Icon as={LuCopy} />
            </IconButton>
          </HStack>
        }
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={isVisible ? 'text' : 'password'}
          disabled={disabled}
          autoComplete="off"
          pe="20"
        />
      </InputGroup>
    </Field>
  );
};

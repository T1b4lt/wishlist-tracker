import { useState } from 'react';
import { Badge, HStack, IconButton, Input, InputGroup } from '@chakra-ui/react';
import { LuCheck, LuEye, LuEyeOff } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui/field';

/**
 * A masked secret field (Google API key, Telegram bot token) with a reveal
 * toggle. When the draft `value` still matches `savedValue` (a truthy,
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
              <LuCheck size={12} aria-hidden="true" />
              {t('pages.settings.badges.configured')}
            </Badge>
          )}
        </HStack>
      }
      helperText={helperText}
      {...rest}
    >
      <InputGroup
        endElement={
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
            {isVisible ? <LuEyeOff /> : <LuEye />}
          </IconButton>
        }
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={isVisible ? 'text' : 'password'}
          disabled={disabled}
          autoComplete="off"
        />
      </InputGroup>
    </Field>
  );
};

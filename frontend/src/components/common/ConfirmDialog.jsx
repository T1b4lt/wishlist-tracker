import { Button, Portal, Text } from '@chakra-ui/react';
import {
  DialogRoot,
  DialogBackdrop,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogActionTrigger,
  DialogCloseTrigger
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

/**
 * A generic confirmation dialog: a title, a body (plain text or arbitrary
 * content, e.g. a `Trans` element), a cancel button and a confirm button.
 * The confirm button is styled destructively (`colorPalette="red"`) when
 * `destructive` is set.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose - Called exactly once when the dialog is
 *   dismissed (backdrop click, Escape, the close button or the cancel
 *   button), all of which route through `onOpenChange` below rather than
 *   also firing their own `onClick`, so `onClose` never double-fires.
 * @param {() => void} props.onConfirm
 * @param {string} props.title
 * @param {import('react').ReactNode} props.body - Rendered as-is inside the
 *   dialog body; wrap plain strings in `<Text>` yourself if you need
 *   different styling, otherwise a bare string still renders directly.
 * @param {string} props.confirmLabel
 * @param {string} [props.cancelLabel] - Defaults to `common.actions.cancel`.
 * @param {boolean} [props.destructive] - Styles the confirm button as a
 *   destructive (red) action. Defaults to `false`.
 * @param {boolean} [props.isLoading] - Disables both buttons and shows a
 *   spinner on the confirm button. Defaults to `false`.
 */
export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  isLoading = false
}) => {
  const { t } = useTranslation();

  return (
    <DialogRoot open={open} onOpenChange={(e) => !e.open && onClose?.()}>
      <Portal>
        <DialogBackdrop />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            {typeof body === 'string' ? <Text>{body}</Text> : body}
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button variant="outline" disabled={isLoading}>
                {cancelLabel ?? t('common.actions.cancel')}
              </Button>
            </DialogActionTrigger>
            <Button
              colorPalette={destructive ? 'red' : 'gray'}
              onClick={onConfirm}
              loading={isLoading}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Portal>
    </DialogRoot>
  );
};

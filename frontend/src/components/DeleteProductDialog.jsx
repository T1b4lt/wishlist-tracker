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
import { Trans, useTranslation } from 'react-i18next';

const DeleteProductDialog = ({ isOpen, onClose, onConfirm, productName }) => {
  const { t } = useTranslation();

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <Portal>
        <DialogBackdrop />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('components.deleteProductDialog.title')}
            </DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <Text>
              <Trans
                i18nKey="components.deleteProductDialog.description"
                values={{ name: productName }}
                components={{ strong: <strong /> }}
              />
            </Text>
            <Text mt={2}>{t('components.deleteProductDialog.warning')}</Text>
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button variant="outline" onClick={onClose}>
                {t('common.actions.cancel')}
              </Button>
            </DialogActionTrigger>
            <Button colorPalette="red" onClick={onConfirm}>
              {t('common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Portal>
    </DialogRoot>
  );
};

export default DeleteProductDialog;

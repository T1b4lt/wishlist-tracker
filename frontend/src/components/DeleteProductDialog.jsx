import { Button, Portal } from '@chakra-ui/react';
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
import { CloseButton } from '@/components/ui/close-button';

const DeleteProductDialog = ({ isOpen, onClose, onConfirm, productName }) => {
  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <Portal>
        <DialogBackdrop />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger asChild>
            <CloseButton size="sm" />
          </DialogCloseTrigger>
          <DialogBody>
            <p>
              Are you sure you want to delete <strong>{productName}</strong>?
            </p>
            <p style={{ marginTop: '8px' }}>
              This action cannot be undone. This will permanently delete the
              product and all its price history.
            </p>
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </DialogActionTrigger>
            <Button colorPalette="red" onClick={onConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Portal>
    </DialogRoot>
  );
};

export default DeleteProductDialog;

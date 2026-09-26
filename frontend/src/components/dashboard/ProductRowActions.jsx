import { useRef } from 'react';
import { Box, HStack, Icon, IconButton, Menu, Portal } from '@chakra-ui/react';
import {
  LuEllipsis,
  LuArrowUpRight,
  LuPencil,
  LuExternalLink,
  LuTrash2
} from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

/**
 * A product's row/card actions menu (Open, Edit, Open store page, Delete),
 * behind a Lucide ellipsis trigger. Stops every click from bubbling past
 * itself, so activating the trigger or any menu item never also triggers
 * the surrounding row's/card's own "navigate to detail" click handler.
 *
 * `onEdit`/`onDelete` are also passed the ellipsis trigger's DOM node, so
 * the caller can hand it to the dialog it opens as `finalFocusEl`: the
 * `Menu.Item` that was actually focused/clicked unmounts as soon as the
 * menu closes, so the dialog's own focus-trap can no longer fall back to
 * "whatever was focused before it opened" (it would land on `<body>`).
 *
 * @param {object} props
 * @param {{ id: number|string, name: string, url: string }} props.product
 * @param {(product: object, triggerEl: HTMLElement|null) => void} props.onEdit
 * @param {(product: object, triggerEl: HTMLElement|null) => void} props.onDelete
 */
export const ProductRowActions = ({ product, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const triggerRef = useRef(null);

  return (
    <Box onClick={(event) => event.stopPropagation()}>
      <Menu.Root positioning={{ placement: 'bottom-end' }}>
        <Menu.Trigger asChild>
          <IconButton
            ref={triggerRef}
            variant="ghost"
            size="sm"
            aria-label={t('pages.dashboard.aria.rowActions', {
              name: product.name
            })}
          >
            <Icon as={LuEllipsis} />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.Item
                value="open"
                onSelect={() => navigate(`/product/${product.id}`)}
              >
                <HStack gap={2}>
                  <Icon as={LuArrowUpRight} size="md" />
                  {t('pages.dashboard.menu.open')}
                </HStack>
              </Menu.Item>
              <Menu.Item
                value="edit"
                onSelect={() => onEdit(product, triggerRef.current)}
              >
                <HStack gap={2}>
                  <Icon as={LuPencil} size="md" />
                  {t('common.actions.edit')}
                </HStack>
              </Menu.Item>
              <Menu.Item
                value="storePage"
                onSelect={() =>
                  window.open(product.url, '_blank', 'noopener,noreferrer')
                }
              >
                <HStack gap={2}>
                  <Icon as={LuExternalLink} size="md" />
                  {t('pages.dashboard.menu.storePage')}
                </HStack>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                value="delete"
                onSelect={() => onDelete(product, triggerRef.current)}
              >
                <HStack gap={2}>
                  <Icon as={LuTrash2} size="md" />
                  {t('common.actions.delete')}
                </HStack>
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Box>
  );
};

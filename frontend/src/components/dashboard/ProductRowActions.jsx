import { Box, HStack, IconButton, Menu, Portal } from '@chakra-ui/react';
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
 * @param {object} props
 * @param {{ id: number|string, name: string, url: string }} props.product
 * @param {(product: object) => void} props.onEdit
 * @param {(product: object) => void} props.onDelete
 */
export const ProductRowActions = ({ product, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  return (
    <Box onClick={(event) => event.stopPropagation()}>
      <Menu.Root positioning={{ placement: 'bottom-end' }}>
        <Menu.Trigger asChild>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('pages.dashboard.aria.rowActions', {
              name: product.name
            })}
          >
            <LuEllipsis />
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
                  <LuArrowUpRight size={16} aria-hidden="true" />
                  {t('pages.dashboard.menu.open')}
                </HStack>
              </Menu.Item>
              <Menu.Item value="edit" onSelect={() => onEdit(product)}>
                <HStack gap={2}>
                  <LuPencil size={16} aria-hidden="true" />
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
                  <LuExternalLink size={16} aria-hidden="true" />
                  {t('pages.dashboard.menu.storePage')}
                </HStack>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item value="delete" onSelect={() => onDelete(product)}>
                <HStack gap={2}>
                  <LuTrash2 size={16} aria-hidden="true" />
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

import { useState } from 'react';
import { HStack, Icon, Image, Text } from '@chakra-ui/react';
import { LuStore } from 'react-icons/lu';
import { faviconUrl } from '@/lib/api/stores';

/** Rendered favicon size per badge size. */
const FAVICON_BOX_SIZES = { sm: '16px', md: '20px' };

/**
 * A store's favicon, served by the backend. Falls back to the Lucide store
 * icon when the store has no favicon or the image fails to load. Always
 * decorative (`alt=""`): the store name is rendered as text next to it.
 *
 * @param {object} props
 * @param {number|null} props.storeId
 * @param {boolean} props.hasFavicon - Whether the backend stored a favicon.
 * @param {'sm'|'md'} [props.size='sm']
 * @param {object} [rest] - Forwarded to the image or icon.
 */
export const StoreFavicon = ({ storeId, hasFavicon, size = 'sm', ...rest }) => {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = hasFavicon && storeId != null ? faviconUrl(storeId) : null;

  if (!src || failedSrc === src) {
    return (
      <Icon
        as={LuStore}
        size={size}
        color="fg.muted"
        flexShrink={0}
        aria-hidden="true"
        {...rest}
      />
    );
  }

  return (
    <Image
      src={src}
      alt=""
      boxSize={FAVICON_BOX_SIZES[size]}
      borderRadius="xs"
      objectFit="contain"
      flexShrink={0}
      onError={() => setFailedSrc(src)}
      {...rest}
    />
  );
};

/**
 * The store a product belongs to: favicon + name. Renders nothing when the
 * product has no store. `sm` is muted, for dense lists; `md` is for the
 * product page and form.
 *
 * @param {object} props
 * @param {number|null} props.storeId
 * @param {string|null} props.name
 * @param {boolean} props.hasFavicon
 * @param {'sm'|'md'} [props.size='sm']
 * @param {object} [rest] - Forwarded to the wrapping `HStack`.
 */
export const StoreBadge = ({
  storeId,
  name,
  hasFavicon,
  size = 'sm',
  ...rest
}) => {
  if (!name) return null;

  return (
    <HStack gap={1.5} minW={0} {...rest}>
      <StoreFavicon storeId={storeId} hasFavicon={hasFavicon} size={size} />
      <Text
        textStyle={size === 'md' ? 'sm' : 'xs'}
        fontWeight="medium"
        color={size === 'md' ? 'fg' : 'fg.muted'}
        truncate
      >
        {name}
      </Text>
    </HStack>
  );
};

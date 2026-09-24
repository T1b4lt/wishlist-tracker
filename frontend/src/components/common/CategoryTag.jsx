import { Circle } from '@chakra-ui/react';
import { Tag } from '@/components/ui/tag';

/**
 * A neutral pill tag for a product's category: a small color dot (the
 * category's own color) followed by its name. The tag itself stays a
 * neutral gray in both color modes; only the dot carries the user's chosen
 * color, so contrast and readability do not depend on it.
 *
 * @param {object} props
 * @param {string} props.name - The category name.
 * @param {string} props.color - The category's color (any CSS color value),
 *   applied to the small dot only.
 * @param {object} [rest] - Forwarded to the underlying `Tag`.
 */
export const CategoryTag = ({ name, color, ...rest }) => (
  <Tag
    size="md"
    variant="subtle"
    colorPalette="gray"
    startElement={<Circle size="8px" bg={color} />}
    {...rest}
  >
    {name}
  </Tag>
);

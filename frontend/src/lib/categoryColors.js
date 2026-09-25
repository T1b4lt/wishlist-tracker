/**
 * Swatches offered by `CategoryColorPicker`. Deliberately a flat, saturated
 * palette: these are the only spots of color in an otherwise monochrome app
 * (category dots and, transitively, `CategoryTag`), so they need to stay
 * visually distinct from each other.
 */
export const CATEGORY_COLOR_SWATCHES = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#A855F7', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#6366F1', // indigo
  '#06B6D4', // cyan
  '#94A3B8', // slate
  '#64748B' // gray
];

/** The swatch a new category starts with when nothing else is selected. */
export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_SWATCHES[0];

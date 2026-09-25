import { LuSignalHigh, LuSignalMedium, LuSignalLow } from 'react-icons/lu';

/**
 * Icon per priority: a signal-strength glyph, not a traffic-light color.
 * Shared by `PriorityBadge` and `ProductFormDialog`'s priority
 * `SegmentedControl`, kept here (rather than exported from the component
 * file) so importing it never drags a component into a plain-constants
 * import and breaks React Fast Refresh.
 */
export const PRIORITY_ICONS = {
  high: LuSignalHigh,
  medium: LuSignalMedium,
  low: LuSignalLow
};

/**
 * Font weight per priority: the only other visual "weight" cue besides the
 * icon. Shared for the same reason as `PRIORITY_ICONS`.
 */
export const PRIORITY_FONT_WEIGHTS = {
  high: 'bold',
  medium: 'medium',
  low: 'normal'
};

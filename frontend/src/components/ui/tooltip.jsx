import { Tooltip as ChakraTooltip, Portal } from '@chakra-ui/react';
import * as React from 'react';

/**
 * Chakra UI v3 snippet component: a tooltip that shows on hover or keyboard
 * focus of its (single) child, positioned via a portal so it never clips
 * inside a scrollable/overflow-hidden ancestor (e.g. a dialog body).
 *
 * The child stays a real, focusable, non-natively-disabled element even
 * when it represents a "disabled" action (see `CategoryList`'s delete
 * button): a native `disabled` button fires neither pointer nor focus
 * events, so it could never trigger this tooltip nor be reached by
 * keyboard. Style it as disabled with `aria-disabled` instead (Chakra's
 * `_disabled` style already matches `[aria-disabled=true]`) and guard the
 * click handler; that keeps it hoverable/focusable so the reason (this
 * tooltip's `content`) is actually reachable and announced.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - A single, focusable
 *   element (e.g. a `Button` or `IconButton`).
 * @param {import('react').ReactNode} props.content - The tooltip's text.
 * @param {boolean} [props.showArrow]
 * @param {boolean} [props.portalled] - Defaults to `true`.
 * @param {object} [props.contentProps] - Forwarded to `ChakraTooltip.Content`.
 * @param {import('react').RefObject} [props.portalRef]
 * @param {boolean} [props.disabled] - When `true`, renders only `children`
 *   (no tooltip machinery at all).
 * @param {object} [rest] - Forwarded to `ChakraTooltip.Root` (e.g.
 *   `openDelay`, `closeDelay`).
 */
export const Tooltip = React.forwardRef(function Tooltip(props, ref) {
  const {
    showArrow,
    children,
    portalled = true,
    content,
    contentProps,
    portalRef,
    disabled,
    ...rest
  } = props;

  if (disabled) return children;

  return (
    <ChakraTooltip.Root {...rest}>
      <ChakraTooltip.Trigger asChild>{children}</ChakraTooltip.Trigger>
      <Portal disabled={!portalled} container={portalRef}>
        <ChakraTooltip.Positioner>
          <ChakraTooltip.Content ref={ref} {...contentProps}>
            {showArrow && (
              <ChakraTooltip.Arrow>
                <ChakraTooltip.ArrowTip />
              </ChakraTooltip.Arrow>
            )}
            {content}
          </ChakraTooltip.Content>
        </ChakraTooltip.Positioner>
      </Portal>
    </ChakraTooltip.Root>
  );
});

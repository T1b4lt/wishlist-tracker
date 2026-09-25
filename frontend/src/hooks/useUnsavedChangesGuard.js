import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

/**
 * Returns `true` for a plain left click with no modifier keys, i.e. a click
 * a browser would otherwise turn into a normal same-tab navigation. Modified
 * clicks (open in new tab, etc.) and non-primary buttons are left alone.
 * @param {MouseEvent} event
 */
function isPlainLeftClick(event) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Guards against losing unsaved changes when leaving a page: intercepts
 * `beforeunload` (closing the tab or reloading) and, since `wouter` has no
 * built-in navigation blocker, in-app link clicks anywhere in the document
 * (header nav, a page's own back link, ...) while `isDirty` is `true`.
 *
 * In-app interception works by listening for clicks in the capture phase at
 * `document`, ahead of the anchor's own default navigation and of `wouter`
 * `Link`'s bubble-phase click handler, so both can be prevented before
 * either runs. Only same-origin, same-page-different-path links are
 * intercepted: a same-path link (e.g. an in-page `#section` anchor) is left
 * alone, since it never leaves the page or loses the draft.
 *
 * @param {boolean} isDirty - Whether there are unsaved changes to guard.
 * @returns {{
 *   isConfirmOpen: boolean,
 *   confirmNavigation: () => void,
 *   cancelNavigation: () => void
 * }} `isConfirmOpen` is `true` while a confirmation is pending for an
 *   intercepted in-app navigation; render a `ConfirmDialog` from it.
 *   `confirmNavigation` proceeds to the intercepted destination.
 *   `cancelNavigation` dismisses the prompt and stays on the page.
 */
export function useUnsavedChangesGuard(isDirty) {
  const [currentPath, navigate] = useLocation();
  const [pendingPath, setPendingPath] = useState(null);

  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      // Required for Chrome; the string itself is never shown to the user.
      event.returnValue = '';
    };

    const handleClickCapture = (event) => {
      if (!isPlainLeftClick(event)) return;

      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;

      let url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same-path links (in-page hash anchors, or a link to the current
      // page) never navigate away, so let them proceed untouched. Compared
      // against wouter's own `location` (pathname only, from `useLocation`)
      // rather than `window.location.pathname`, so this also works under a
      // non-browser location hook (e.g. `memoryLocation` in tests).
      if (url.pathname === currentPath) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingPath(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleClickCapture, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleClickCapture, true);
    };
  }, [isDirty, currentPath]);

  const confirmNavigation = () => {
    if (pendingPath) navigate(pendingPath);
    setPendingPath(null);
  };

  const cancelNavigation = () => setPendingPath(null);

  return {
    isConfirmOpen: pendingPath !== null,
    confirmNavigation,
    cancelNavigation
  };
}

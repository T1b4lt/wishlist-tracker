import { useLocation } from 'wouter';

/**
 * Props for a table row or card that navigates to `href` on click and on
 * Enter, while staying keyboard-focusable as a single tab stop. Enter is
 * only handled when the row/card itself has focus (`target ===
 * currentTarget`): a nested interactive element (e.g. the actions menu's
 * trigger or an open menu item) receives its own keydown target, so this
 * does not also navigate while operating the menu.
 *
 * A click that starts inside the actions menu never reaches `onClick` here
 * in the first place: `ProductRowActions` stops that propagation itself.
 *
 * @param {string} href - The detail page path to navigate to.
 * @returns {{
 *   onClick: () => void,
 *   onKeyDown: (event: import('react').KeyboardEvent) => void,
 *   tabIndex: number,
 *   role: 'link',
 *   cursor: 'pointer'
 * }}
 */
export function useRowActivation(href) {
  const [, navigate] = useLocation();

  return {
    onClick: () => navigate(href),
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        navigate(href);
      }
    },
    tabIndex: 0,
    role: 'link',
    cursor: 'pointer'
  };
}

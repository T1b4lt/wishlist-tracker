import { useEffect } from 'react';

/**
 * Set `document.title` to `"<page title> | Wishlist Tracker"` while the
 * component using it is mounted, and restore the previous title on unmount.
 *
 * @param {string} title - The page-specific part of the title.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | Wishlist Tracker` : 'Wishlist Tracker';

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}

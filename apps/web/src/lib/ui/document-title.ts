'use client';

import { useEffect } from 'react';

/** Same `'%s | ORUWA'` shape as the root layout's `metadata.title.template`. */
export function formatDocumentTitle(title: string): string {
  return `${title} | ORUWA`;
}

/**
 * QA3 (2026-10-14): server `metadata.title` is static and Japanese, but the
 * JA/EN choice is client-side (`LangProvider`, `localStorage`), and a page can
 * render a state that is not the page itself (e.g. /manager showing "Access
 * denied" while the tab still said "Manager | ORUWA"). This keeps the tab
 * title in step with the visible headline and the selected language. Pass
 * `null` to leave the server title alone. No cleanup on purpose: restoring an
 * old title on unmount could overwrite the next page's own title.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title) document.title = formatDocumentTitle(title);
  }, [title]);
}

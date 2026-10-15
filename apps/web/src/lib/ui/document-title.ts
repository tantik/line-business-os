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
 * `null` to leave the server title alone. No cleanup of the title on purpose:
 * restoring an old title on unmount could overwrite the next page's own title.
 *
 * Next.js streams the metadata `<title>` and can commit it after this effect
 * has run (seen live on a first load with EN stored: the tab fell back to
 * 「ログイン | ORUWA」), so while mounted the title is re-applied whenever
 * something else rewrites it.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const wanted = formatDocumentTitle(title);
    // Navigation can commit the next page's title before this cleanup runs;
    // never re-apply once the URL is no longer this page's.
    const pathname = window.location.pathname;
    const apply = () => {
      if (window.location.pathname === pathname && document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}

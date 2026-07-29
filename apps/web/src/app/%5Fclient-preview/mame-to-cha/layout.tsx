import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';
import { LangProvider } from '@/lib/demo/cafe/i18n';

/**
 * Shared visual boundary for every DB-backed Mame To Cha surface.
 *
 * The root application shell is intentionally dark, while the Cafe package
 * uses the warm light palette. Keeping that boundary here prevents Manager,
 * Staff, Recipes, and their safe states from drifting into route-specific
 * wrappers or exposing the root background between Cafe cards.
 *
 * `LangProvider` is mounted HERE (not per-page) so every route -- including
 * early-return safe states (`no access`, `module unavailable`, `no profile`,
 * etc., rendered before a page's own tenant/module resolution completes) and
 * the recipe detail route (which previously had no LangProvider at all) --
 * can call `useLang()`. Mounting it only inside individual pages' own return
 * JSX (the previous approach) left every early-return branch unable to read
 * the user's persisted language choice, since a component outside the
 * provider tree cannot call `useLang()`. Centralizing it once here also
 * means no future preview route can forget to wrap itself.
 */
export default function MameToChaPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: demoColors.bg, color: demoColors.textPrimary }}>
      <LangProvider>{children}</LangProvider>
    </div>
  );
}

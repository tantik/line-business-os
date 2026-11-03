'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useLang } from '@/lib/demo/cafe/i18n';
import { displayItemName, type InventoryNameTranslations } from './item-name-display';

/**
 * Carries the page's inventory item name translations (0153, built
 * server-side, current ones only) to every component that shows an item
 * name -- Inventory, Purchases (needed / awaiting / history), receipts,
 * Attention, recipe ingredient picker -- without threading a prop through
 * each of them. No provider (or an empty map) = original names everywhere.
 */
const InventoryItemNamesContext = createContext<InventoryNameTranslations>({});

export function InventoryItemNamesProvider({
  translations,
  children,
}: {
  translations: InventoryNameTranslations | null | undefined;
  children: ReactNode;
}) {
  return <InventoryItemNamesContext.Provider value={translations ?? {}}>{children}</InventoryItemNamesContext.Provider>;
}

/** The raw map, for components that already receive `lang` as a prop (pair with `displayItemName`). */
export function useInventoryNameTranslations(): InventoryNameTranslations {
  return useContext(InventoryItemNamesContext);
}

/**
 * `(itemId, originalName) => name to show` in the current UI language (via
 * `displayItemName`). A null/undefined id or name (e.g. a receipt line whose
 * item was deleted) returns the name unchanged. Must be used under the
 * caller's `LangProvider`.
 */
export function useInventoryItemName(): <N extends string | null | undefined>(itemId: string | null | undefined, name: N) => N | string {
  const { lang } = useLang();
  const translations = useContext(InventoryItemNamesContext);
  return useCallback(
    <N extends string | null | undefined>(itemId: string | null | undefined, name: N): N | string =>
      itemId && name ? displayItemName({ itemId, name }, lang, translations) : name,
    [lang, translations],
  );
}

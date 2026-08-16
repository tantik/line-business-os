'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Minimal JA/EN language switch, shared by the public cafe demo
 * (`/demo/cafe`, `/demo/cafe/recipes`) and the canonical authenticated
 * Manager/Staff/Inventory/Admin/Recipes dashboards (each mounts its own
 * `LangProvider` instance; persistence is per-browser via `localStorage`,
 * not shared state across them). Static dictionaries per surface, no ICU/
 * plural/interpolation library, no auto-translation.
 */
export type Lang = 'ja' | 'en';

const STORAGE_KEY = 'demo-cafe-lang';

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ja');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'ja' || stored === 'en') setLangState(stored);
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within a LangProvider');
  return ctx;
}

/** Tiny `t()` factory over a `{ ja: {...}, en: {...} }` dictionary — not a generic i18n framework. */
export function makeTranslator<D extends object>(dictionary: Record<Lang, D>) {
  return function translate(lang: Lang, key: keyof D): string {
    return dictionary[lang][key] as unknown as string;
  };
}

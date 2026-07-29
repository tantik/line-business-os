'use client';

import type { ReactNode } from 'react';
import { mutedText as darkMutedText, pageStyle as darkPageStyle } from '@/lib/ui/theme';
import { mutedText as lightMutedText, pageStyle as lightPageStyle } from '@/lib/demo/cafe/theme';
import { useLang, makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * Neutral "safe state" components for the Mame To Cha preview shell.
 * Mirrors `@/components/states` but never reveals whether the `mame-to-cha`
 * tenant exists, tenant/role UUIDs, raw Supabase/Postgres errors, or internal
 * route paths (architecture plan Section 9).
 *
 * `variant` defaults to `'dark'` (the shared app theme, `@/lib/ui/theme`) so
 * every existing caller (hub/staff/recipes preview routes) is unaffected.
 * The Cafe manager route is the one exception: its `layout.tsx` wraps the
 * page in the light cafe background for the unified manager screen, so it
 * passes `variant="light"` to keep these safe states legible on that
 * background instead of rendering dark-theme muted text on a light page.
 *
 * `useLang()` requires a `LangProvider` ancestor. Since `apps/web/src/app/
 * %5Fclient-preview/mame-to-cha/layout.tsx` mounts `LangProvider` for the
 * ENTIRE preview route tree (not per-page), every one of this file's
 * components -- including early-return states rendered before a page's own
 * tenant/module/location resolution completes -- is always inside a
 * provider. Before that layout change, several call sites returned these
 * states before their own page-local `LangProvider` wrap existed, which
 * would have made `useLang()` throw; centralizing the provider at the
 * layout level is what makes this file safe to convert to a client
 * component reading `useLang()`.
 */
export type PreviewStateVariant = 'dark' | 'light';

interface StatesDict {
  noAccessTitle: string;
  noAccessBody: string;
  moduleUnavailableTitle: string;
  moduleUnavailableBody: string;
  locationBlockedTitle: string;
  locationBlockedNone: string;
  locationBlockedAmbiguous: string;
  noProfileTitle: string;
  noProfileBody: string;
  notFoundTitle: string;
  notFoundBody: string;
  errorTitle: string;
  errorBody: string;
  readOnlyNotice: string;
}

const STATES_DICT: Record<Lang, StatesDict> = {
  ja: {
    noAccessTitle: 'アクセスできません',
    noAccessBody: 'このプレビューを閲覧する権限がありません。担当者にお問い合わせください。',
    moduleUnavailableTitle: 'この機能は現在利用できません',
    moduleUnavailableBody: 'ワークフォース機能はこのワークスペースで有効になっていません。',
    locationBlockedTitle: '店舗の設定が必要です',
    locationBlockedNone: '有効な店舗が設定されていません。担当者にお問い合わせください。',
    locationBlockedAmbiguous: '複数の店舗が有効になっています。担当者にお問い合わせください。',
    noProfileTitle: 'スタッフ情報が見つかりません',
    noProfileBody: 'このアカウントに紐づくスタッフ情報がありません。担当者にお問い合わせください。',
    notFoundTitle: '見つかりません',
    notFoundBody: 'お探しの項目は存在しないか、閲覧できません。',
    errorTitle: 'エラーが発生しました',
    errorBody: '一時的な問題が発生しました。しばらくしてからもう一度お試しください。',
    readOnlyNotice: 'このプレビューは閲覧専用です。編集機能は次の受け入れステップで有効になります。',
  },
  en: {
    noAccessTitle: 'Access denied',
    noAccessBody: 'You do not have permission to view this preview. Please contact your administrator.',
    moduleUnavailableTitle: 'This feature is not currently available',
    moduleUnavailableBody: 'The Workforce module is not enabled for this workspace.',
    locationBlockedTitle: 'Store setup required',
    locationBlockedNone: 'No active store is configured. Please contact your administrator.',
    locationBlockedAmbiguous: 'More than one store is active. Please contact your administrator.',
    noProfileTitle: 'No staff profile found',
    noProfileBody: 'No staff profile is linked to this account. Please contact your administrator.',
    notFoundTitle: 'Not found',
    notFoundBody: 'The item you are looking for does not exist or cannot be viewed.',
    errorTitle: 'An error occurred',
    errorBody: 'Something went wrong. Please try again in a moment.',
    readOnlyNotice: 'This preview is read-only. Editing will be enabled in a later acceptance step.',
  },
};

const t = makeTranslator(STATES_DICT);

function PreviewStateShell({
  title,
  children,
  variant = 'dark',
}: {
  title: string;
  children?: ReactNode;
  variant?: PreviewStateVariant;
}) {
  const pageStyleFn = variant === 'light' ? lightPageStyle : darkPageStyle;
  return (
    <main style={pageStyleFn(640)}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      {children}
    </main>
  );
}

function stateMutedText(variant: PreviewStateVariant) {
  return variant === 'light' ? lightMutedText : darkMutedText;
}

/** Covers not-a-member, foreign-slug-only membership, and any lookup failure - deliberately indistinguishable. */
export function PreviewNoAccessState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  const { lang } = useLang();
  return (
    <PreviewStateShell title={t(lang, 'noAccessTitle')} variant={variant}>
      <p style={stateMutedText(variant)}>{t(lang, 'noAccessBody')}</p>
    </PreviewStateShell>
  );
}

export function PreviewModuleUnavailableState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  const { lang } = useLang();
  return (
    <PreviewStateShell title={t(lang, 'moduleUnavailableTitle')} variant={variant}>
      <p style={stateMutedText(variant)}>{t(lang, 'moduleUnavailableBody')}</p>
    </PreviewStateShell>
  );
}

export function PreviewLocationBlockedState({
  reason,
  variant = 'dark',
}: {
  reason: 'none' | 'ambiguous';
  variant?: PreviewStateVariant;
}) {
  const { lang } = useLang();
  return (
    <PreviewStateShell title={t(lang, 'locationBlockedTitle')} variant={variant}>
      <p style={stateMutedText(variant)}>
        {reason === 'none' ? t(lang, 'locationBlockedNone') : t(lang, 'locationBlockedAmbiguous')}
      </p>
    </PreviewStateShell>
  );
}

export function PreviewNoProfileState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  const { lang } = useLang();
  return (
    <PreviewStateShell title={t(lang, 'noProfileTitle')} variant={variant}>
      <p style={stateMutedText(variant)}>{t(lang, 'noProfileBody')}</p>
    </PreviewStateShell>
  );
}

export function PreviewNotFoundState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  const { lang } = useLang();
  return (
    <PreviewStateShell title={t(lang, 'notFoundTitle')} variant={variant}>
      <p style={stateMutedText(variant)}>{t(lang, 'notFoundBody')}</p>
    </PreviewStateShell>
  );
}

export function PreviewErrorState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  const { lang } = useLang();
  return (
    <PreviewStateShell title={t(lang, 'errorTitle')} variant={variant}>
      <p style={stateMutedText(variant)}>{t(lang, 'errorBody')}</p>
    </PreviewStateShell>
  );
}

/** Shown on read-only preview screens that would otherwise expose editing controls. */
export function PreviewReadOnlyNotice() {
  const { lang } = useLang();
  return (
    <div
      style={{
        border: '1px solid #d9c9a3',
        background: '#fbf3e2',
        color: '#6b5423',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      {t(lang, 'readOnlyNotice')}
    </div>
  );
}

import type { ReactNode } from 'react';
import { mutedText as darkMutedText, pageStyle as darkPageStyle } from '@/lib/ui/theme';
import { mutedText as lightMutedText, pageStyle as lightPageStyle } from '@/lib/demo/cafe/theme';

/**
 * Neutral, Japanese-language "safe state" components for the Mame To Cha
 * preview shell. Mirrors `@/components/states` but never reveals whether the
 * `mame-to-cha` tenant exists, tenant/role UUIDs, raw Supabase/Postgres
 * errors, or internal route paths (architecture plan Section 9).
 *
 * `variant` defaults to `'dark'` (the shared app theme, `@/lib/ui/theme`) so
 * every existing caller (hub/staff/recipes preview routes) is unaffected.
 * The Cafe manager route is the one exception: its `layout.tsx` wraps the
 * page in the light cafe background for the unified manager screen, so it
 * passes `variant="light"` to keep these safe states legible on that
 * background instead of rendering dark-theme muted text on a light page.
 */
export type PreviewStateVariant = 'dark' | 'light';

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
  return (
    <PreviewStateShell title="アクセスできません" variant={variant}>
      <p style={stateMutedText(variant)}>このプレビューを閲覧する権限がありません。担当者にお問い合わせください。</p>
    </PreviewStateShell>
  );
}

export function PreviewModuleUnavailableState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  return (
    <PreviewStateShell title="この機能は現在利用できません" variant={variant}>
      <p style={stateMutedText(variant)}>ワークフォース機能はこのワークスペースで有効になっていません。</p>
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
  return (
    <PreviewStateShell title="店舗の設定が必要です" variant={variant}>
      <p style={stateMutedText(variant)}>
        {reason === 'none'
          ? '有効な店舗が設定されていません。担当者にお問い合わせください。'
          : '複数の店舗が有効になっています。担当者にお問い合わせください。'}
      </p>
    </PreviewStateShell>
  );
}

export function PreviewNoProfileState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  return (
    <PreviewStateShell title="スタッフ情報が見つかりません" variant={variant}>
      <p style={stateMutedText(variant)}>このアカウントに紐づくスタッフ情報がありません。担当者にお問い合わせください。</p>
    </PreviewStateShell>
  );
}

export function PreviewNotFoundState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  return (
    <PreviewStateShell title="見つかりません" variant={variant}>
      <p style={stateMutedText(variant)}>お探しの項目は存在しないか、閲覧できません。</p>
    </PreviewStateShell>
  );
}

export function PreviewErrorState({ variant = 'dark' }: { variant?: PreviewStateVariant } = {}) {
  return (
    <PreviewStateShell title="エラーが発生しました" variant={variant}>
      <p style={stateMutedText(variant)}>一時的な問題が発生しました。しばらくしてからもう一度お試しください。</p>
    </PreviewStateShell>
  );
}

/** Shown on read-only preview screens that would otherwise expose editing controls. */
export function PreviewReadOnlyNotice() {
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
      このプレビューは閲覧専用です。編集機能は次の受け入れステップで有効になります。
    </div>
  );
}

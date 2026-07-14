import type { ReactNode } from 'react';
import { mutedText, pageStyle } from '@/lib/ui/theme';

/**
 * Neutral, Japanese-language "safe state" components for the Mame To Cha
 * preview shell. Mirrors `@/components/states` but never reveals whether the
 * `mame-to-cha` tenant exists, tenant/role UUIDs, raw Supabase/Postgres
 * errors, or internal route paths (architecture plan Section 9).
 */

function PreviewStateShell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main style={pageStyle(640)}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      {children}
    </main>
  );
}

/** Covers not-a-member, foreign-slug-only membership, and any lookup failure - deliberately indistinguishable. */
export function PreviewNoAccessState() {
  return (
    <PreviewStateShell title="アクセスできません">
      <p style={mutedText}>このプレビューを閲覧する権限がありません。担当者にお問い合わせください。</p>
    </PreviewStateShell>
  );
}

export function PreviewModuleUnavailableState() {
  return (
    <PreviewStateShell title="この機能は現在利用できません">
      <p style={mutedText}>ワークフォース機能はこのワークスペースで有効になっていません。</p>
    </PreviewStateShell>
  );
}

export function PreviewLocationBlockedState({ reason }: { reason: 'none' | 'ambiguous' }) {
  return (
    <PreviewStateShell title="店舗の設定が必要です">
      <p style={mutedText}>
        {reason === 'none'
          ? '有効な店舗が設定されていません。担当者にお問い合わせください。'
          : '複数の店舗が有効になっています。担当者にお問い合わせください。'}
      </p>
    </PreviewStateShell>
  );
}

export function PreviewNoProfileState() {
  return (
    <PreviewStateShell title="スタッフ情報が見つかりません">
      <p style={mutedText}>このアカウントに紐づくスタッフ情報がありません。担当者にお問い合わせください。</p>
    </PreviewStateShell>
  );
}

export function PreviewNotFoundState() {
  return (
    <PreviewStateShell title="見つかりません">
      <p style={mutedText}>お探しの項目は存在しないか、閲覧できません。</p>
    </PreviewStateShell>
  );
}

export function PreviewErrorState() {
  return (
    <PreviewStateShell title="エラーが発生しました">
      <p style={mutedText}>一時的な問題が発生しました。しばらくしてからもう一度お試しください。</p>
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

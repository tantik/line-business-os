import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Phase 1N-4C Slice B2a - shared, fixed, neutral result contract for every
 * preview write Server Action (architecture plan Section 11 / B2 plan
 * Section 11). Deliberately coarser than any raw Supabase/Postgres error or
 * the underlying `WorkforceWriteResult`/`TenantAccessResult` status: no
 * status here ever carries a tenant/employee UUID, an internal route path,
 * an RLS policy name, or raw Postgres/PostgREST error text.
 *
 * Trimmed 2026-08-16 when the `_client-preview` route tree (Surface A) was
 * retired: this module's own preview-route consumers are gone, but the
 * Japanese/English status->message dictionary is still shared with
 * `@/lib/demo/cafe/i18n.test.ts`, so the type + message functions stay.
 * The `mapPreview*`/`mapWorkforceWriteResult` adapters and
 * `previewStaffDeleteMessage`/`PREVIEW_INVALID_INPUT_RESULT` had no callers
 * left outside the deleted route tree and were removed with it.
 */
export type PreviewWriteFailureStatus =
  | 'not_authenticated'
  | 'no_access'
  | 'module_disabled'
  | 'location_blocked'
  | 'no_profile'
  | 'invalid_input'
  | 'not_found'
  | 'duplicate'
  | 'blocked_by_history'
  | 'blocked_not_archived'
  | 'stale_reference'
  | 'language_change_requires_confirmation'
  | 'unexpected_error';

export type PreviewWriteResult<T> =
  | { status: 'success'; data: T }
  | { status: PreviewWriteFailureStatus };

const PREVIEW_WRITE_MESSAGES_JA: Record<PreviewWriteFailureStatus, string> = {
  not_authenticated: 'サインインが必要です。',
  no_access: 'この操作を行う権限がありません。',
  module_disabled: 'ワークフォース機能はこのワークスペースで有効になっていません。',
  location_blocked: '店舗の設定を確認できません。担当者にお問い合わせください。',
  no_profile: 'このアカウントに紐づくスタッフ情報がありません。担当者にお問い合わせください。',
  invalid_input: '入力内容を確認してください。',
  not_found: '対象の情報が見つかりません。',
  duplicate: 'すでに同じ内容が登録されています。',
  blocked_by_history: 'この商品には過去の在庫記録があるため完全に削除できません。「無効化」をご利用ください。',
  blocked_not_archived: 'アーカイブ済みのレシピのみ完全に削除できます。先にアーカイブしてください。',
  stale_reference: 'この依頼は最新の状態ではありません。対象のシフトが変更されたか、すでに他の担当者が承認・却下済みです。最新の内容に更新しました。',
  language_change_requires_confirmation: '元の言語を変更しようとしています。既存の内容は削除されません。変更を確認してもう一度保存してください。',
  unexpected_error: '一時的な問題が発生しました。しばらくしてからもう一度お試しください。',
};

export function previewWriteMessageJa(status: PreviewWriteFailureStatus): string {
  return PREVIEW_WRITE_MESSAGES_JA[status];
}

const PREVIEW_WRITE_MESSAGES_EN: Record<PreviewWriteFailureStatus, string> = {
  not_authenticated: 'Please sign in again.',
  no_access: 'You do not have permission to do this.',
  module_disabled: 'The Workforce module is not enabled for this workspace.',
  location_blocked: 'The store setup could not be resolved. Please contact your administrator.',
  no_profile: 'No staff profile is linked to this account. Please contact your administrator.',
  invalid_input: 'Please check your input.',
  not_found: 'The requested item was not found.',
  duplicate: 'This has already been submitted.',
  blocked_by_history: 'This item has past stock-count history, so it cannot be permanently deleted. Use Deactivate instead.',
  blocked_not_archived: 'Only an Archived recipe can be permanently deleted. Archive it first.',
  stale_reference: 'This request is no longer up to date — the shift may have changed, or another manager may have already decided it. It has been refreshed to the latest state.',
  language_change_requires_confirmation: 'You are changing this recipe’s original language. Existing content will not be deleted. Please confirm the change and save again.',
  unexpected_error: 'Something went wrong. Please try again in a moment.',
};

/** Lang-aware version of `previewWriteMessageJa`. */
export function previewWriteMessage(lang: Lang, status: PreviewWriteFailureStatus): string {
  return lang === 'en' ? PREVIEW_WRITE_MESSAGES_EN[status] : PREVIEW_WRITE_MESSAGES_JA[status];
}

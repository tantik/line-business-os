import type { WorkforceWriteResult } from '@/lib/workforce/result-types';
import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Shared client-side error copy for every write call on this page -- the
 * single place this text lives. `lang` defaults to `'en'` so existing call
 * sites outside a `LangProvider` keep working; the Staff dashboard's own
 * forms pass their `lang` from `useLang()`/props.
 */
export function describeWriteError(
  result: Exclude<WorkforceWriteResult<unknown>, { status: 'success' }>,
  lang: Lang = 'en',
): string {
  switch (result.status) {
    case 'not_found':
      return lang === 'ja' ? '見つかりません。' : 'Not found.';
    case 'not_authenticated':
      return lang === 'ja' ? '再度サインインしてください。' : 'Please sign in again.';
    case 'no_membership':
      return lang === 'ja' ? 'このワークスペースのメンバーではありません。' : 'You are not a member of this workspace.';
    case 'blocked_by_history':
      return lang === 'ja'
        ? '履歴が存在するため、完全に削除できません。'
        : 'This has historical records and cannot be permanently deleted.';
    case 'blocked_not_archived':
      return lang === 'ja'
        ? 'アーカイブ済みのレシピのみ完全に削除できます。'
        : 'Only an archived recipe can be permanently deleted.';
    case 'stale_reference':
      return lang === 'ja'
        ? 'このリクエストは現在のスケジュールと一致しません。最新の状態を確認してください。'
        : 'This request no longer matches the current schedule. Refresh to see the latest state.';
    case 'language_change_requires_confirmation':
      return lang === 'ja'
        ? 'このレシピの元の言語を変更しようとしています。既存のコンテンツは削除されません。変更内容を確認のうえ、再度保存してください。'
        : 'You are changing this recipe’s original language. Existing content will not be deleted. Please confirm the change and save again.';
    default:
      return result.message;
  }
}

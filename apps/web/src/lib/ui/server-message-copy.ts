import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Copy Audit A-03 (DEBT-053): the `message` on an `unauthorized` /
 * `duplicate` / `config_error` / `unexpected_error` result is an English
 * server sentence or, worse, a raw Postgres/PostgREST `error.message`. It
 * must never reach the user as-is. Known, meaningful server sentences get a
 * fixed JA/EN translation; anything else becomes a generic per-status
 * message, and the original goes to the console for developers only.
 */
const KNOWN: Record<string, { ja: string; en: string }> = {
  'You have already clocked in today.': { ja: '本日はすでに出勤済みです。', en: 'You have already clocked in today.' },
  'This employee is already bound to an account.': {
    ja: 'このスタッフはすでに別のアカウントに紐付けられています。',
    en: 'This staff member is already linked to an account.',
  },
  'An active shift type with this name already exists.': {
    ja: '同じ名前の有効なシフト種別がすでにあります。',
    en: 'An active shift type with this name already exists.',
  },
  'Your session has expired. Please sign in again.': {
    ja: 'ログインの有効期限が切れました。もう一度ログインしてください。',
    en: 'Your session has expired. Please sign in again.',
  },
  'Your invitation link has expired. Ask your manager to resend it.': {
    ja: '招待リンクの有効期限が切れています。店長に再送を依頼してください。',
    en: 'Your invitation link has expired. Ask your manager to resend it.',
  },
  'You have no staff profile in this tenant.': {
    ja: 'この店舗にスタッフ情報が登録されていません。店長にお問い合わせください。',
    en: 'You have no staff profile in this store. Please contact your manager.',
  },
  'Your staff profile has no assigned location.': {
    ja: 'スタッフ情報に勤務先の店舗が設定されていません。店長にお問い合わせください。',
    en: 'Your staff profile has no assigned store. Please contact your manager.',
  },
  'This employee is deactivated and cannot be invited.': {
    ja: '無効化されたスタッフは招待できません。',
    en: 'A deactivated staff member cannot be invited.',
  },
  'This employee has no contact email on file.': {
    ja: 'このスタッフにはメールアドレスが登録されていません。',
    en: 'This staff member has no email address on file.',
  },
  'This employee has never been invited yet -- use Invite, not Recover access.': {
    ja: 'このスタッフはまだ招待されていません。「招待する」を使ってください。',
    en: 'This staff member has not been invited yet. Use "Invite".',
  },
  'Could not upload the photo.': { ja: '写真をアップロードできませんでした。', en: 'Could not upload the photo.' },
  'Could not process the photo.': { ja: '写真を処理できませんでした。', en: 'Could not process the photo.' },
  'Weekly Review requires exactly one active location for this workspace.': {
    ja: '週次レビューは、有効な店舗が1つの場合のみ表示できます。',
    en: 'Weekly Review needs exactly one active store.',
  },
  'Invalid input.': { ja: '入力内容を確認してください。', en: 'Please check what you entered.' },
};

const GENERIC = {
  unauthorized: { ja: 'この操作を行う権限がありません。', en: 'You do not have permission to do this.' },
  duplicate: { ja: '同じ内容がすでに登録されています。', en: 'This already exists.' },
  other: { ja: 'エラーが発生しました。もう一度お試しください。', en: 'Something went wrong. Please try again.' },
} as const;

export function localizeServerMessage(status: string, message: string | undefined, lang: Lang): string {
  const known = message ? KNOWN[message] : undefined;
  if (known) return known[lang];
  if (message) console.warn(`[server message, not shown to user] ${status}: ${message}`);
  if (status === 'unauthorized') return GENERIC.unauthorized[lang];
  if (status === 'duplicate') return GENERIC.duplicate[lang];
  return GENERIC.other[lang];
}

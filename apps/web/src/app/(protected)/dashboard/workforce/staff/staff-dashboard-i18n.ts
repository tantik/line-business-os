import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the canonical dashboard Staff surface's schedule/
 * shift-exchange/Inventory-entry section -- the part of `/dashboard/workforce/staff`
 * added or reworked by the Cafe v2.1 canonical Staff consolidation. Reuses
 * the existing `LangProvider`/`useLang`/`makeTranslator` mechanism
 * (`@/lib/demo/cafe/i18n`) already powering `_client-preview`'s JA/EN
 * toggle -- a new dictionary, not a new i18n system. Deliberately scoped to
 * this section only (not the pre-existing, already-bilingual-labelled
 * shift-preference/work-report/correction-request sections further down the
 * same page, and never the Manager dashboard) -- see the task brief's
 * explicit "do not create a broad i18n refactor" instruction.
 */
interface StaffDashboardDict {
  scheduleHeading: string;
  all: string;
  onlyMe: string;
  prevWeek: string;
  thisWeek: string;
  nextWeek: string;
  scheduleUnavailable: string;
  scheduledThisWeekLabel: string;
  meLabel: string;
  colleaguePrefixLabel: string;
  shiftLabel: string;
  timeLabel: string;
  clockInLabel: string;
  clockOutLabel: string;
  transportationLabel: string;
  noShiftOrReport: string;
  requestChangeHeading: string;
  exchangeSubmitted: string;
  inventoryTitle: string;
  inventoryDescription: string;
  inventorySufficient: string;
  inventoryOpen: string;
  inventoryNotEnabled: string;
  requestTypeLabel: string;
  optionExchange: string;
  optionCancel: string;
  reasonLabel: string;
  submit: string;
  submitting: string;
}

const dictionary: Record<Lang, StaffDashboardDict> = {
  en: {
    scheduleHeading: 'Published schedule',
    all: 'All',
    onlyMe: 'Only me',
    prevWeek: 'Prev week',
    thisWeek: 'This week',
    nextWeek: 'Next week',
    scheduleUnavailable: 'Your schedule is temporarily unavailable.',
    scheduledThisWeekLabel: 'Scheduled this week',
    meLabel: 'Me',
    colleaguePrefixLabel: 'Staff',
    shiftLabel: 'Shift',
    timeLabel: 'Time',
    clockInLabel: 'Clock in',
    clockOutLabel: 'Clock out',
    transportationLabel: 'Transportation',
    noShiftOrReport: 'No shift or work report for this date.',
    requestChangeHeading: 'Request a shift change or cancellation',
    exchangeSubmitted: 'Shift exchange request submitted.',
    inventoryTitle: 'Inventory',
    inventoryDescription: "Daily stock check for this location.",
    inventorySufficient: 'All items sufficient',
    inventoryOpen: 'Open Inventory',
    inventoryNotEnabled: 'Inventory (not enabled)',
    requestTypeLabel: 'Request type',
    optionExchange: 'Offer for exchange',
    optionCancel: 'Request cancellation',
    reasonLabel: 'Reason',
    submit: 'Submit request',
    submitting: 'Submitting...',
  },
  ja: {
    scheduleHeading: '公開シフト',
    all: 'すべて',
    onlyMe: '自分のみ',
    prevWeek: '前週',
    thisWeek: '今週',
    nextWeek: '次週',
    scheduleUnavailable: 'スケジュールは一時的に利用できません。',
    scheduledThisWeekLabel: '今週の予定時間',
    meLabel: '自分',
    colleaguePrefixLabel: 'スタッフ',
    shiftLabel: 'シフト',
    timeLabel: '時間',
    clockInLabel: '出勤',
    clockOutLabel: '退勤',
    transportationLabel: '交通費',
    noShiftOrReport: 'この日にはシフトも勤務報告もありません。',
    requestChangeHeading: 'シフト変更・キャンセルを申請',
    exchangeSubmitted: 'シフト交換リクエストを送信しました。',
    inventoryTitle: '在庫',
    inventoryDescription: 'この店舗の日次在庫確認。',
    inventorySufficient: '在庫はすべて十分です',
    inventoryOpen: '在庫を開く',
    inventoryNotEnabled: '在庫（未有効）',
    requestTypeLabel: '申請種別',
    optionExchange: '交換希望',
    optionCancel: 'キャンセル希望',
    reasonLabel: '理由',
    submit: '申請を送信',
    submitting: '送信中...',
  },
};

export const tStaffDashboard = makeTranslator(dictionary);

/** Parameterized strings that don't fit `makeTranslator`'s fixed-string shape. */
export const scheduledThisWeekValue: Record<Lang, (hours: string) => string> = {
  en: (hours) => `Scheduled this week: ${hours}h`,
  ja: (hours) => `今週の予定時間: ${hours}h`,
};

export const inventoryShortageLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} item(s) need restocking`,
  ja: (count) => `${count}件の商品が要補充です`,
};

export const existingExchangeMessage: Record<Lang, (status: string) => string> = {
  en: (status) => `A ${status} exchange request already exists for this shift.`,
  ja: (status) => `このシフトにはすでに${status}状態の交換リクエストがあります。`,
};

/** Minimal JA/EN mapping for the `WorkforceWriteResult` statuses the shift-exchange request form can actually surface -- scoped counterpart to `error-copy.ts`'s English-only `describeWriteError`, for this consolidation's new exchange flow only. */
export function describeExchangeError(lang: Lang, status: string): string {
  const messages: Record<Lang, Record<string, string>> = {
    en: {
      not_found: 'Not found.',
      not_authenticated: 'Please sign in again.',
      no_membership: 'You are not a member of this workspace.',
      stale_reference: 'This request no longer matches the current schedule. Refresh to see the latest state.',
      duplicate: 'This request already exists.',
    },
    ja: {
      not_found: '見つかりません。',
      not_authenticated: '再度サインインしてください。',
      no_membership: 'このワークスペースのメンバーではありません。',
      stale_reference: 'このリクエストは現在のスケジュールと一致しません。最新の状態を確認してください。',
      duplicate: 'このリクエストはすでに存在します。',
    },
  };
  const fallback: Record<Lang, string> = {
    en: 'Something went wrong. Please try again.',
    ja: '問題が発生しました。もう一度お試しください。',
  };
  return messages[lang][status] ?? fallback[lang];
}

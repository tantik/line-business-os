import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the Issues & Handover module's Manager frontend slice
 * (Cafe v2.2 WP2, Slice B). Reuses the existing `LangProvider`/`useLang`/
 * `makeTranslator` mechanism (`@/lib/demo/cafe/i18n`), the same one every
 * other canonical dashboard surface uses -- a new dictionary, not a new i18n
 * system. Japanese is this product's primary end-user language (AGENTS.md);
 * every key ships both languages.
 */
interface IssuesDict {
  popupTitle: string;
  popupHelpAriaLabel: string;
  popupHelpTitle: string;
  popupHelpBody: string;
  backToManager: string;
  formCancel: string;
  unavailable: string;

  viewSwitcherLabel: string;
  viewOpen: string;
  viewHistory: string;

  reportButton: string;
  reportHeading: string;
  formKindLabel: string;
  kindIssue: string;
  kindHandover: string;
  formCategoryLabel: string;
  categoryOptionNone: string;
  categoryEquipment: string;
  categoryInventory: string;
  categoryCleaning: string;
  categoryFacility: string;
  categoryCustomer: string;
  categoryOperations: string;
  categoryOther: string;
  formSeverityLabel: string;
  severityNormal: string;
  severityImportant: string;
  formNoteLabel: string;
  formSubmit: string;
  formSubmitting: string;
  reportSuccess: string;

  emptyOpenTitle: string;
  emptyOpenDescription: string;
  emptyHistoryTitle: string;
  emptyHistoryDescription: string;

  statusOpen: string;
  statusAcknowledged: string;
  statusResolved: string;
  kindHandoverBadge: string;

  reportedByLabel: string;
  reportedByStaff: string;
  reportedByManager: string;
  businessDateLabel: string;
  reportedAtLabel: string;
  acknowledgedAtLabel: string;
  resolvedAtLabel: string;
  resolutionNoteLabel: string;

  acknowledgeButton: string;
  resolveButton: string;
  resolveNoteLabel: string;
  resolveSubmit: string;

  errNoAuthContext: string;
  errModuleDisabled: string;
  errInvalidKind: string;
  errInvalidCategory: string;
  errInvalidSeverity: string;
  errSeverityNotApplicableToHandover: string;
  errInvalidNote: string;
  errPermissionDenied: string;
  errNotFound: string;
  errNotOpen: string;
  errAlreadyResolved: string;
  errorGeneric: string;
  errorNotAuthenticated: string;
  errorNoMembership: string;
}

const dictionary: Record<Lang, IssuesDict> = {
  en: {
    popupTitle: 'Issues & Handover',
    popupHelpAriaLabel: 'About Issues & Handover',
    popupHelpTitle: 'About Issues & Handover',
    popupHelpBody:
      'Report an operational problem (e.g. broken equipment) or leave a note for the next shift. A reported issue with "Needs action" severity stays visible until a manager acknowledges or resolves it. Resolved items move to History; nothing is ever deleted.',
    backToManager: 'Back',
    formCancel: 'Cancel',
    unavailable: 'Issues & Handover is temporarily unavailable.',

    viewSwitcherLabel: 'Issues & Handover view',
    viewOpen: 'Open',
    viewHistory: 'History',

    reportButton: '+ Report',
    reportHeading: 'Report an issue or handover note',
    formKindLabel: 'Type',
    kindIssue: 'Issue (a problem)',
    kindHandover: 'Handover note (information)',
    formCategoryLabel: 'Category (optional)',
    categoryOptionNone: 'None',
    categoryEquipment: 'Equipment',
    categoryInventory: 'Inventory',
    categoryCleaning: 'Cleaning',
    categoryFacility: 'Facility',
    categoryCustomer: 'Customer',
    categoryOperations: 'Operations',
    categoryOther: 'Other',
    formSeverityLabel: 'Severity',
    severityNormal: 'Normal',
    severityImportant: 'Needs action',
    formNoteLabel: 'Note',
    formSubmit: 'Report',
    formSubmitting: 'Reporting…',
    reportSuccess: 'Reported.',

    emptyOpenTitle: 'No open issues',
    emptyOpenDescription: 'Nothing needs attention right now -- every report has been handled.',
    emptyHistoryTitle: 'No history yet',
    emptyHistoryDescription: 'Resolved issues and handover notes will appear here.',

    statusOpen: 'Open',
    statusAcknowledged: 'Acknowledged',
    statusResolved: 'Resolved',
    kindHandoverBadge: 'Handover',

    reportedByLabel: 'Reported by',
    reportedByStaff: 'Staff',
    reportedByManager: 'Manager',
    businessDateLabel: 'Business date',
    reportedAtLabel: 'Reported',
    acknowledgedAtLabel: 'Acknowledged',
    resolvedAtLabel: 'Resolved',
    resolutionNoteLabel: 'Resolution note',

    acknowledgeButton: 'Acknowledge',
    resolveButton: 'Resolve',
    resolveNoteLabel: 'Resolution note (optional)',
    resolveSubmit: 'Mark as resolved',

    errNoAuthContext: 'Please sign in again.',
    errModuleDisabled: 'Issues & Handover is not enabled for this workspace.',
    errInvalidKind: 'Please choose a valid type.',
    errInvalidCategory: 'Please choose a valid category.',
    errInvalidSeverity: 'Please choose a valid severity.',
    errSeverityNotApplicableToHandover: 'A handover note does not have a severity.',
    errInvalidNote: 'Please enter a note (up to 1000 characters).',
    errPermissionDenied: 'You do not have permission to do this.',
    errNotFound: 'This item could not be found.',
    errNotOpen: 'This item is no longer open.',
    errAlreadyResolved: 'This item has already been resolved.',
    errorGeneric: 'Something went wrong. Please try again.',
    errorNotAuthenticated: 'Please sign in again.',
    errorNoMembership: 'You are not a member of this workspace.',
  },
  ja: {
    popupTitle: '申し送り・問題報告',
    popupHelpAriaLabel: '申し送り・問題報告について',
    popupHelpTitle: '申し送り・問題報告について',
    popupHelpBody:
      '設備の不具合などの問題を報告したり、次のシフトへの申し送りメモを残せます。「要対応」の問題は、マネージャーが確認または解決するまで表示され続けます。解決済みの項目は履歴に移動し、削除されることはありません。',
    backToManager: '戻る',
    formCancel: 'キャンセル',
    unavailable: '申し送り・問題報告は一時的に利用できません。',

    viewSwitcherLabel: '申し送り・問題報告の表示',
    viewOpen: '対応中',
    viewHistory: '履歴',

    reportButton: '+ 報告する',
    reportHeading: '問題または申し送りを報告',
    formKindLabel: '種類',
    kindIssue: '問題（対応が必要な事項）',
    kindHandover: '申し送りメモ（情報共有）',
    formCategoryLabel: 'カテゴリー（任意）',
    categoryOptionNone: '指定なし',
    categoryEquipment: '設備',
    categoryInventory: '在庫',
    categoryCleaning: '清掃',
    categoryFacility: '施設',
    categoryCustomer: 'お客様対応',
    categoryOperations: 'オペレーション',
    categoryOther: 'その他',
    formSeverityLabel: '重要度',
    severityNormal: '通常',
    severityImportant: '要対応',
    formNoteLabel: 'メモ',
    formSubmit: '報告する',
    formSubmitting: '報告中…',
    reportSuccess: '報告しました。',

    emptyOpenTitle: '対応中の問題はありません',
    emptyOpenDescription: '現在、対応が必要な項目はありません。報告された内容はすべて処理済みです。',
    emptyHistoryTitle: 'まだ履歴はありません',
    emptyHistoryDescription: '解決済みの問題や申し送りメモはここに表示されます。',

    statusOpen: '未対応',
    statusAcknowledged: '確認済み',
    statusResolved: '解決済み',
    kindHandoverBadge: '申し送り',

    reportedByLabel: '報告者',
    reportedByStaff: 'スタッフ',
    reportedByManager: 'マネージャー',
    businessDateLabel: '営業日',
    reportedAtLabel: '報告日時',
    acknowledgedAtLabel: '確認日時',
    resolvedAtLabel: '解決日時',
    resolutionNoteLabel: '解決メモ',

    acknowledgeButton: '確認する',
    resolveButton: '解決する',
    resolveNoteLabel: '解決メモ（任意）',
    resolveSubmit: '解決済みにする',

    errNoAuthContext: 'もう一度サインインしてください。',
    errModuleDisabled: 'このワークスペースでは申し送り・問題報告が有効になっていません。',
    errInvalidKind: '有効な種類を選択してください。',
    errInvalidCategory: '有効なカテゴリーを選択してください。',
    errInvalidSeverity: '有効な重要度を選択してください。',
    errSeverityNotApplicableToHandover: '申し送りメモには重要度がありません。',
    errInvalidNote: 'メモを入力してください（1000文字以内）。',
    errPermissionDenied: 'この操作を行う権限がありません。',
    errNotFound: 'この項目が見つかりませんでした。',
    errNotOpen: 'この項目はすでに対応中ではありません。',
    errAlreadyResolved: 'この項目はすでに解決済みです。',
    errorGeneric: 'エラーが発生しました。もう一度お試しください。',
    errorNotAuthenticated: 'もう一度サインインしてください。',
    errorNoMembership: 'このワークスペースのメンバーではありません。',
  },
};

export const tIssues = makeTranslator(dictionary);
export type IssuesDictKey = Parameters<typeof tIssues>[1];

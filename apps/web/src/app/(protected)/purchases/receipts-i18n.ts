import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';
import type { ReceiptErrorCode } from '@/lib/purchases/spend-receipts';

/**
 * JA/EN strings for purchase receipts (レシート, DEBT-136) -- same
 * `makeTranslator` mechanism as `purchases-i18n.ts`, its own dictionary so
 * the shopping-list dictionary stays readable.
 */
interface ReceiptsDict {
  filterReceipts: string;
  addReceiptButton: string;
  addReceiptPrompt: string;
  newReceiptButton: string;
  sheetTitleNew: string;
  sheetTitleEdit: string;
  photoLabel: string;
  photoHintOptional: string;
  photoHintRequired: string;
  takePhotoButton: string;
  replacePhotoButton: string;
  removePhotoButton: string;
  photoWillBeRemoved: string;
  amountLabel: string;
  amountHint: string;
  dateLabel: string;
  itemsLabel: string;
  itemsHint: string;
  noCandidateItems: string;
  categoryLabel: string;
  categoryHintNoItems: string;
  categoryNone: string;
  categoryFood: string;
  categorySupplies: string;
  categoryEquipment: string;
  categoryOther: string;
  categoryStock: string;
  noteLabel: string;
  notePlaceholder: string;
  saveButton: string;
  savingButton: string;
  cancelButton: string;
  savedNotice: string;
  myReceiptsTitle: string;
  allReceiptsTitle: string;
  loading: string;
  loadFailed: string;
  retryButton: string;
  emptyMine: string;
  emptyAll: string;
  amountMissing: string;
  canceledBadge: string;
  canceledReasonPrefix: string;
  viewPhotoAria: string;
  editAction: string;
  cancelReceiptAction: string;
  moreActionsAria: string;
  cancelDialogTitle: string;
  cancelDialogBody: string;
  cancelReasonLabel: string;
  cancelConfirmButton: string;
  keepButton: string;
  editableTodayHint: string;
  unknownPerson: string;
  monthPrevAria: string;
  monthNextAria: string;
  summaryTitle: string;
  summaryByPerson: string;
  summaryByCategory: string;
  settingsAction: string;
  settingsTitle: string;
  settingsSaveButton: string;
  settingsEnabledLabel: string;
  settingsPhotoLabel: string;
  photoModeOff: string;
  photoModeOptional: string;
  photoModeRequired: string;
  receiptsOffNotice: string;
  receiptsOffManagerNotice: string;
  closeButton: string;
  errors: Record<ReceiptErrorCode | 'generic' |'needs_amount_or_photo' | 'needs_amount' | 'needs_category_note' | 'needs_photo' | 'cancel_reason_required', string>;
}

const dictionary: Record<Lang, ReceiptsDict> = {
  en: {
    filterReceipts: 'Receipts',
    addReceiptButton: 'Add receipt',
    addReceiptPrompt: 'Saved. Have a receipt? Add it now.',
    newReceiptButton: '+ Receipt',
    sheetTitleNew: 'Add a receipt',
    sheetTitleEdit: 'Edit receipt',
    photoLabel: 'Photo of the receipt',
    photoHintOptional: 'Optional. The total must stay readable.',
    photoHintRequired: 'Required at this store.',
    takePhotoButton: 'Take or choose photo',
    replacePhotoButton: 'Replace photo',
    removePhotoButton: 'Remove photo',
    photoWillBeRemoved: 'The photo will be removed when you save.',
    amountLabel: 'Total (¥, tax incl.)',
    amountHint: 'As printed. You can leave it empty if you add a photo — the manager fills it in later.',
    dateLabel: 'Purchase date',
    itemsLabel: 'What this receipt covers',
    itemsHint: 'Items marked bought or received today.',
    noCandidateItems: 'No items marked today. Choose a category and add a note instead.',
    categoryLabel: 'Category',
    categoryHintNoItems: 'Required when no item is ticked.',
    categoryNone: 'Not set',
    categoryFood: 'Food',
    categorySupplies: 'Supplies & cleaning',
    categoryEquipment: 'Equipment',
    categoryOther: 'Other',
    categoryStock: 'Stock items',
    noteLabel: 'Note',
    notePlaceholder: 'e.g. paper towels, detergent',
    saveButton: 'Save receipt',
    savingButton: 'Saving…',
    cancelButton: 'Cancel',
    savedNotice: 'Receipt saved.',
    myReceiptsTitle: 'My receipts',
    allReceiptsTitle: 'Receipts of this store',
    loading: 'Loading receipts…',
    loadFailed: 'Receipts could not be loaded.',
    retryButton: 'Try again',
    emptyMine: 'No receipts in this month. Add one after you buy something.',
    emptyAll: 'No receipts in this month.',
    amountMissing: 'No amount yet',
    canceledBadge: 'Canceled',
    canceledReasonPrefix: 'Reason:',
    viewPhotoAria: 'Open the receipt photo',
    editAction: 'Edit',
    cancelReceiptAction: 'Cancel receipt',
    moreActionsAria: 'More actions',
    cancelDialogTitle: 'Cancel this receipt?',
    cancelDialogBody: 'It stays in the list as canceled and is no longer counted. The items can go on another receipt.',
    cancelReasonLabel: 'Reason',
    cancelConfirmButton: 'Cancel receipt',
    keepButton: 'Keep',
    editableTodayHint: 'You can edit your receipts until the end of the day.',
    unknownPerson: 'Unknown',
    monthPrevAria: 'Previous month',
    monthNextAria: 'Next month',
    summaryTitle: 'Spend',
    summaryByPerson: 'By person',
    summaryByCategory: 'By category',
    settingsAction: 'Receipt settings',
    settingsTitle: 'Receipt settings',
    settingsSaveButton: 'Save',
    settingsEnabledLabel: 'Staff can add receipts',
    settingsPhotoLabel: 'Receipt photo',
    photoModeOff: 'Off',
    photoModeOptional: 'Optional',
    photoModeRequired: 'Required',
    receiptsOffNotice: 'Receipts are switched off at this store.',
    receiptsOffManagerNotice: 'Receipts are switched off. Existing receipts can still be corrected.',
    closeButton: 'Close',
    errors: {
      generic: 'Something went wrong. Please try again.',
      needs_amount_or_photo: 'Add the total or a photo.',
      needs_amount: 'Enter the total.',
      cancel_reason_required: 'Enter a reason.',
      needs_category_note: 'Without items, choose a category and write a note.',
      needs_photo: 'A photo of the receipt is required.',
      module_disabled: 'Purchases are not enabled for this workspace.',
      receipts_disabled: 'Receipts are switched off at this store.',
      photo_required: 'A photo of the receipt is required.',
      photo_off: 'Photos are switched off at this store.',
      edit_window_closed: 'This receipt can no longer be changed. Ask your manager.',
      canceled: 'This receipt was canceled.',
      not_found: 'This receipt no longer exists.',
      item_not_allowed: 'One of the items is already on another receipt. Reload and try again.',
      amount_or_photo_required: 'Add the total or a photo.',
      category_and_note_required: 'Without items, choose a category and write a note.',
      invalid_date: 'Choose a date within the last 90 days.',
      invalid_amount: 'Enter the total in yen (whole number).',
      photo_upload_failed: 'The photo could not be uploaded. Please try again.',
      invalid_input: 'Please check the fields.',
    },
  },
  ja: {
    filterReceipts: 'レシート',
    addReceiptButton: 'レシートを追加',
    addReceiptPrompt: '記録しました。レシートがあれば追加してください。',
    newReceiptButton: '＋ レシート',
    sheetTitleNew: 'レシートを追加',
    sheetTitleEdit: 'レシートを編集',
    photoLabel: 'レシートの写真',
    photoHintOptional: '任意です。合計金額が読めるように撮ってください。',
    photoHintRequired: 'この店舗では写真が必須です。',
    takePhotoButton: '写真を撮る・選ぶ',
    replacePhotoButton: '写真を変更',
    removePhotoButton: '写真を削除',
    photoWillBeRemoved: '保存すると写真が削除されます。',
    amountLabel: '合計金額（円・税込）',
    amountHint: 'レシートに印字された金額です。写真があれば空欄でも保存でき、あとで店長が入力します。',
    dateLabel: '購入日',
    itemsLabel: 'このレシートの品目',
    itemsHint: '今日「購入済み」「入荷」になった品目です。',
    noCandidateItems: '今日記録した品目はありません。カテゴリとメモを入力してください。',
    categoryLabel: 'カテゴリ',
    categoryHintNoItems: '品目を選ばない場合は必須です。',
    categoryNone: '未設定',
    categoryFood: '食材',
    categorySupplies: '消耗品・清掃',
    categoryEquipment: '備品',
    categoryOther: 'その他',
    categoryStock: '仕入れ品',
    noteLabel: 'メモ',
    notePlaceholder: '例：ペーパータオル、洗剤',
    saveButton: 'レシートを保存',
    savingButton: '保存中…',
    cancelButton: 'キャンセル',
    savedNotice: 'レシートを保存しました。',
    myReceiptsTitle: '自分のレシート',
    allReceiptsTitle: '店舗のレシート',
    loading: 'レシートを読み込み中…',
    loadFailed: 'レシートを読み込めませんでした。',
    retryButton: '再読み込み',
    emptyMine: 'この月のレシートはありません。購入したら追加してください。',
    emptyAll: 'この月のレシートはありません。',
    amountMissing: '金額未入力',
    canceledBadge: '取消',
    canceledReasonPrefix: '理由：',
    viewPhotoAria: 'レシートの写真を開く',
    editAction: '編集',
    cancelReceiptAction: 'レシートを取り消す',
    moreActionsAria: 'その他の操作',
    cancelDialogTitle: 'このレシートを取り消しますか？',
    cancelDialogBody: '一覧には「取消」として残り、集計から外れます。品目は別のレシートに付けられます。',
    cancelReasonLabel: '理由',
    cancelConfirmButton: '取り消す',
    keepButton: '戻る',
    editableTodayHint: '自分のレシートは当日中なら編集できます。',
    unknownPerson: '不明',
    monthPrevAria: '前の月',
    monthNextAria: '次の月',
    summaryTitle: '支出',
    summaryByPerson: '担当者別',
    summaryByCategory: 'カテゴリ別',
    settingsAction: 'レシートの設定',
    settingsTitle: 'レシートの設定',
    settingsSaveButton: '保存',
    settingsEnabledLabel: 'スタッフがレシートを追加できる',
    settingsPhotoLabel: 'レシートの写真',
    photoModeOff: 'なし',
    photoModeOptional: '任意',
    photoModeRequired: '必須',
    receiptsOffNotice: 'この店舗ではレシート機能がオフです。',
    receiptsOffManagerNotice: 'レシート機能はオフです（既存のレシートの修正のみ可能）。',
    closeButton: '閉じる',
    errors: {
      generic: 'エラーが発生しました。もう一度お試しください。',
      needs_amount_or_photo: '合計金額か写真を入力してください。',
      needs_amount: '合計金額を入力してください。',
      cancel_reason_required: '理由を入力してください。',
      needs_category_note: '品目を選ばない場合は、カテゴリとメモを入力してください。',
      needs_photo: 'レシートの写真が必要です。',
      module_disabled: 'このワークスペースでは仕入れ機能が有効ではありません。',
      receipts_disabled: 'この店舗ではレシート機能がオフです。',
      photo_required: 'レシートの写真が必要です。',
      photo_off: 'この店舗では写真をオフにしています。',
      edit_window_closed: 'このレシートはもう変更できません。店長に依頼してください。',
      canceled: 'このレシートは取り消されています。',
      not_found: 'このレシートは見つかりません。',
      item_not_allowed: '品目のひとつがすでに別のレシートに付いています。再読み込みしてください。',
      amount_or_photo_required: '合計金額か写真を入力してください。',
      category_and_note_required: '品目を選ばない場合は、カテゴリとメモを入力してください。',
      invalid_date: '過去90日以内の日付を選んでください。',
      invalid_amount: '合計金額を円（整数）で入力してください。',
      photo_upload_failed: '写真をアップロードできませんでした。もう一度お試しください。',
      invalid_input: '入力内容を確認してください。',
    },
  },
};

type ScalarKey = Exclude<keyof ReceiptsDict, 'errors'>;
const translate = makeTranslator(dictionary);

export function tReceipts(lang: Lang, key: ScalarKey): string {
  return translate(lang, key);
}

export function tReceiptError(lang: Lang, key: keyof ReceiptsDict['errors']): string {
  return dictionary[lang].errors[key];
}

/** 「5件」 / "5 receipts". */
export function formatReceiptCount(lang: Lang, count: number): string {
  return lang === 'ja' ? `${count}件` : `${count} ${count === 1 ? 'receipt' : 'receipts'}`;
}

/** 「金額未入力 3件」 / "3 without amount". */
export function formatMissingAmountCount(lang: Lang, count: number): string {
  return lang === 'ja' ? `金額未入力 ${count}件` : `${count} without amount`;
}

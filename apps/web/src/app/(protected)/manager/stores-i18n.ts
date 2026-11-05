import type { Lang } from '@/lib/demo/cafe/i18n';
import type { LocationManageErrorCode } from '@/lib/tenant/location-manage';

/**
 * DEBT-139 L3: copy of the cabinet 「店舗」 section (stores-section.tsx), the
 * Manager scope choice (manager-role-section.tsx) and the 「別の店舗へ移動」
 * dialog (move-store-section.tsx). One self-contained block, like
 * `ownerChecklistCopy`, so it merges independently of the big dictionary.
 * 店舗 = one store (location); the company is the workspace.
 */

export interface StoresCopy {
  heading: string;
  intro: string;
  mainBadge: string;
  currentBadge: string;
  archivedHeading: string;
  archivedHint: string;
  activeListLabel: string;
  addNameLabel: string;
  addNameHint: string;
  addButton: string;
  adding: string;
  rowMenuLabel: (name: string) => string;
  rename: string;
  archive: string;
  restore: string;
  renameTitle: string;
  renameNameLabel: string;
  save: string;
  saving: string;
  cancel: string;
  archiveConfirmTitle: string;
  archiveConfirmBody: string;
  created: (name: string) => string;
  renamed: string;
  archived: string;
  restored: string;
  unchanged: string;
  errors: Record<LocationManageErrorCode, string>;
}

export interface ManagerScopeCopy {
  legend: string;
  location: string;
  tenant: string;
  locationHint: string;
  tenantHint: string;
  currentLocation: string;
  currentTenant: string;
  changeToTenant: string;
  changeToLocation: string;
  changeConfirmTitle: string;
  changeToTenantBody: string;
  changeToLocationBody: string;
  changed: string;
}

export interface MoveStoreCopy {
  heading: string;
  current: (storeName: string) => string;
  noCurrent: string;
  button: string;
  title: string;
  targetLabel: string;
  requestsNote: string;
  shiftsNote: string;
  historyNote: string;
  managerNote: string;
  confirm: string;
  moving: string;
  moved: (storeName: string, cancelledRequests: number) => string;
  unchanged: string;
}

const errorsJa: Record<LocationManageErrorCode, string> = {
  invalid_input: '入力内容を確認して、もう一度お試しください。',
  invalid_name: '店舗名は1〜60文字で入力してください。',
  name_taken: '同じ名前の店舗がすでにあります。別の名前にしてください。',
  limit_reached: 'ご自身で追加できる店舗数の上限に達しました。さらに店舗を増やす場合は、ORUWAサポートまでお問い合わせください。',
  invalid_timezone: '店舗のタイムゾーン設定に問題があります。ORUWAサポートまでお問い合わせください。',
  tenant_not_active: 'このワークスペースは現在ご利用いただけない状態です。ORUWAサポートまでお問い合わせください。',
  location_not_found: '店舗が見つかりません。画面を更新して、もう一度お試しください。',
  last_active_location: '営業中の店舗を少なくとも1つ残す必要があります。',
  has_active_staff: 'この店舗に所属している有効なスタッフがいます。先にスタッフを別の店舗へ移動するか、無効にしてください。',
  has_future_shifts: 'このスタッフには今の店舗で今日以降のシフトがあります。先にシフト表からそのシフトを外してから移動してください。',
  employee_inactive: '無効のスタッフは移動できません。先に有効にしてください。',
  employee_has_no_location: '所属店舗が決まっていないスタッフです。画面を更新して、もう一度お試しください。',
  module_disabled: 'このワークスペースではシフト管理機能が無効です。',
  permission_denied: '店舗の管理はオーナーまたは管理者のみ行えます。',
  not_authenticated: 'ログインの有効期限が切れました。もう一度ログインしてください。',
  unexpected: '保存できませんでした。もう一度お試しください。',
};

const errorsEn: Record<LocationManageErrorCode, string> = {
  invalid_input: 'Please check your input and try again.',
  invalid_name: 'Store names must be 1–60 characters.',
  name_taken: 'A store with this name already exists. Please choose another name.',
  limit_reached: 'You have reached the number of stores you can add yourself. To add more stores, please contact ORUWA support.',
  invalid_timezone: 'There is a problem with the store’s time zone. Please contact ORUWA support.',
  tenant_not_active: 'This workspace is not available right now. Please contact ORUWA support.',
  location_not_found: 'This store was not found. Refresh the page and try again.',
  last_active_location: 'At least one store must stay open.',
  has_active_staff: 'Active staff still belong to this store. Move them to another store or deactivate them first.',
  has_future_shifts: 'This staff member has shifts at their current store from today on. Remove those shifts from the schedule first, then move them.',
  employee_inactive: 'Inactive staff cannot be moved. Reactivate them first.',
  employee_has_no_location: 'This staff member has no home store yet. Refresh the page and try again.',
  module_disabled: 'Shift management is turned off for this workspace.',
  permission_denied: 'Only the owner or an admin can manage stores.',
  not_authenticated: 'Your session has expired. Please sign in again.',
  unexpected: 'Could not save. Please try again.',
};

export const storesCopy: Record<Lang, StoresCopy> = {
  ja: {
    heading: '店舗',
    intro: '店舗の追加・名前の変更・アーカイブができます。最初に登録した店舗がメイン店舗として先頭に表示されます。',
    mainBadge: 'メイン',
    currentBadge: '表示中',
    archivedHeading: 'アーカイブ済み',
    archivedHint: 'アーカイブした店舗の記録はそのまま残ります。必要になったら元に戻せます。',
    activeListLabel: '営業中の店舗',
    addNameLabel: '新しい店舗の名前',
    addNameHint: '1〜60文字。シフトの種類や点検項目などは、メイン店舗の設定がコピーされます。',
    addButton: '店舗を追加',
    adding: '追加中…',
    rowMenuLabel: (name) => `「${name}」の操作`,
    rename: '名前を変更',
    archive: 'アーカイブする',
    restore: '元に戻す',
    renameTitle: '店舗名を変更',
    renameNameLabel: '店舗名',
    save: '保存',
    saving: '保存中…',
    cancel: 'キャンセル',
    archiveConfirmTitle: 'この店舗をアーカイブしますか？',
    archiveConfirmBody:
      'アーカイブすると店舗の切り替えに表示されなくなり、自動シフト作成と毎日の点検タスクも止まります。シフト・勤怠・仕入れなどの記録は消えず、あとで元に戻せます。この店舗に所属しているスタッフがいる場合は、先に別の店舗へ移動するか、無効にしてください。',
    created: (name) => `「${name}」を追加しました。`,
    renamed: '店舗名を変更しました。',
    archived: '店舗をアーカイブしました。',
    restored: '店舗を元に戻しました。自動シフト作成は、必要に応じてその店舗の設定でオンにしてください。',
    unchanged: '変更はありません。',
    errors: errorsJa,
  },
  en: {
    heading: 'Stores',
    intro: 'Add, rename or archive stores. The store you registered first is the main store and is listed first.',
    mainBadge: 'Main',
    currentBadge: 'Viewing',
    archivedHeading: 'Archived',
    archivedHint: 'An archived store keeps all its records. You can restore it when you need it again.',
    activeListLabel: 'Open stores',
    addNameLabel: 'New store name',
    addNameHint: '1–60 characters. Shift types, checklists and other settings are copied from the main store.',
    addButton: 'Add store',
    adding: 'Adding…',
    rowMenuLabel: (name) => `Actions for “${name}”`,
    rename: 'Rename',
    archive: 'Archive',
    restore: 'Restore',
    renameTitle: 'Rename store',
    renameNameLabel: 'Store name',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    archiveConfirmTitle: 'Archive this store?',
    archiveConfirmBody:
      'An archived store disappears from the store switcher, and its automatic schedule and daily checklist tasks stop. Its records (shifts, attendance, purchases and more) are kept, and you can restore it later. If staff still belong to this store, move them to another store or deactivate them first.',
    created: (name) => `“${name}” added.`,
    renamed: 'Store renamed.',
    archived: 'Store archived.',
    restored: 'Store restored. Turn its automatic schedule back on in that store’s settings if you need it.',
    unchanged: 'Nothing changed.',
    errors: errorsEn,
  },
};

export const managerScopeCopy: Record<Lang, ManagerScopeCopy> = {
  ja: {
    legend: '店長として管理する範囲',
    location: 'この店舗のみ',
    tenant: '全店舗',
    locationHint: '所属している店舗だけを管理できます。',
    tenantHint: 'すべての店舗のスタッフ・シフト・仕入れなどを管理できます。',
    currentLocation: 'この店舗のみの店長です。',
    currentTenant: '全店舗の店長です。',
    changeToTenant: '全店舗の店長にする',
    changeToLocation: 'この店舗のみの店長にする',
    changeConfirmTitle: '店長の範囲を変更しますか？',
    changeToTenantBody: 'すべての店舗のスタッフ情報（時給・連絡先を含む）、シフト、仕入れ・在庫、店舗設定を管理できるようになります。',
    changeToLocationBody: '所属している店舗だけを管理できるようになります。ほかの店舗のマネージャー画面は使えなくなります。',
    changed: '店長の範囲を変更しました。',
  },
  en: {
    legend: 'Manager of',
    location: 'This store only',
    tenant: 'All stores',
    locationHint: 'Can manage only the store they belong to.',
    tenantHint: 'Can manage staff, shifts, purchasing and more at every store.',
    currentLocation: 'Manager of this store only.',
    currentTenant: 'Manager of all stores.',
    changeToTenant: 'Make manager of all stores',
    changeToLocation: 'Make manager of this store only',
    changeConfirmTitle: 'Change what they manage?',
    changeToTenantBody: 'They will be able to manage staff information (including hourly wages and contacts), shifts, purchasing, inventory and store settings at every store.',
    changeToLocationBody: 'They will manage only the store they belong to and can no longer open the Manager screen of other stores.',
    changed: 'Manager scope changed.',
  },
};

export const moveStoreCopy: Record<Lang, MoveStoreCopy> = {
  ja: {
    heading: '所属店舗',
    current: (storeName) => `所属：${storeName}`,
    noCurrent: '所属店舗：未設定',
    button: '別の店舗へ移動',
    title: '別の店舗へ移動',
    targetLabel: '移動先の店舗',
    requestsNote: '今の店舗で承認待ちのシフト希望・休み希望・シフト交代の申請は取り消されます。',
    shiftsNote: '今の店舗に今日以降のシフトがある場合は移動できません。先にシフト表から外してください。',
    historyNote: '過去のシフトや勤怠の記録は今の店舗に残ります。',
    managerNote: '「この店舗のみ」の店長の権限も、移動先の店舗に移ります。',
    confirm: '移動する',
    moving: '移動中…',
    moved: (storeName, cancelledRequests) =>
      cancelledRequests > 0
        ? `「${storeName}」へ移動しました。承認待ちの申請を${cancelledRequests}件取り消しました。`
        : `「${storeName}」へ移動しました。`,
    unchanged: 'すでにこの店舗に所属しています。',
  },
  en: {
    heading: 'Home store',
    current: (storeName) => `Belongs to: ${storeName}`,
    noCurrent: 'Home store: not set',
    button: 'Move to another store',
    title: 'Move to another store',
    targetLabel: 'Move to',
    requestsNote: 'Their pending shift, leave and shift-swap requests at the current store will be cancelled.',
    shiftsNote: 'They cannot be moved while they have shifts at the current store from today on. Remove those shifts from the schedule first.',
    historyNote: 'Past shifts and attendance records stay with the current store.',
    managerNote: 'Their “this store only” manager rights move to the new store too.',
    confirm: 'Move',
    moving: 'Moving…',
    moved: (storeName, cancelledRequests) =>
      cancelledRequests > 0
        ? `Moved to “${storeName}”. ${cancelledRequests} pending ${cancelledRequests === 1 ? 'request was' : 'requests were'} cancelled.`
        : `Moved to “${storeName}”.`,
    unchanged: 'They already belong to this store.',
  },
};

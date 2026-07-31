import { makeTranslator, type Lang } from './i18n';

interface ShiftExchangeDict {
  staffTitle: string;
  staffDescription: string;
  selectShiftPlaceholder: string;
  reasonPlaceholder: string;
  requestButton: string;
  shiftFallback: string;
  statusAccepted: string;
  statusWaitingOwn: string;
  statusAvailable: string;
  cancelRequest: string;
  acceptShift: string;
  recentResults: string;
  resultApproved: string;
  resultRejected: string;
  resultCancelled: string;
  managerTitle: string;
  noExchanges: string;
  unknownStaff: string;
  waitingForCandidate: string;
  approveButton: string;
  rejectButton: string;
  viewExchanges: string;
  noActiveExchanges: string;
  requestExchangeButton: string;
  requestExchangeModalTitle: string;
  submitting: string;
  close: string;
}

/** UI-chrome dictionary for the Shift Exchange staff/manager preview panels. Static system-chrome copy only. */
const SHIFT_EXCHANGE_DICT: Record<Lang, ShiftExchangeDict> = {
  ja: {
    staffTitle: 'シフト交換',
    staffDescription:
      '出勤できないシフトを公開し、代わりのスタッフを募集できます。最終変更は店長が承認します。',
    selectShiftPlaceholder: '交換するシフトを選択',
    reasonPlaceholder: '理由（店長と候補スタッフに表示されます）',
    requestButton: '交換を依頼',
    shiftFallback: '対象シフト',
    statusAccepted: '候補者が承諾済み・店長確認待ち',
    statusWaitingOwn: '候補者を募集中',
    statusAvailable: '交換可能',
    cancelRequest: '依頼を取消',
    acceptShift: '代わりに出勤する',
    recentResults: '最近の結果',
    resultApproved: '承認済み — シフトを更新しました',
    resultRejected: '却下されました',
    resultCancelled: '取り消しました',
    managerTitle: 'シフト交換の承認',
    noExchanges: '確認待ちの依頼はありません。',
    unknownStaff: '不明なスタッフ',
    waitingForCandidate: '候補者待ち',
    approveButton: '承認してシフトを変更',
    rejectButton: '却下',
    viewExchanges: 'シフト交換を見る',
    noActiveExchanges: '進行中の交換依頼はありません。',
    requestExchangeButton: '交換を依頼する',
    requestExchangeModalTitle: 'シフト交換を依頼',
    submitting: '送信中...',
    close: '閉じる',
  },
  en: {
    staffTitle: 'Shift exchange',
    staffDescription: 'Offer a shift you cannot work. A colleague may accept it; the manager makes the final approval.',
    selectShiftPlaceholder: 'Select a shift',
    reasonPlaceholder: 'Reason (visible to manager and candidates)',
    requestButton: 'Request exchange',
    shiftFallback: 'Shift',
    statusAccepted: 'Accepted by a colleague; awaiting manager',
    statusWaitingOwn: 'Waiting for a colleague',
    statusAvailable: 'Available to accept',
    cancelRequest: 'Cancel request',
    acceptShift: 'Accept this shift',
    recentResults: 'Recent results',
    resultApproved: 'Approved — schedule updated',
    resultRejected: 'Rejected',
    resultCancelled: 'Cancelled',
    managerTitle: 'Shift exchange approvals',
    noExchanges: 'No exchanges need review.',
    unknownStaff: 'Unknown staff',
    waitingForCandidate: 'waiting for candidate',
    approveButton: 'Approve and update schedule',
    rejectButton: 'Reject',
    viewExchanges: 'View shift exchanges',
    noActiveExchanges: 'No exchanges in progress.',
    requestExchangeButton: 'Request exchange',
    requestExchangeModalTitle: 'Request a shift exchange',
    submitting: 'Submitting...',
    close: 'Close',
  },
};

export const tShiftExchange = makeTranslator(SHIFT_EXCHANGE_DICT);

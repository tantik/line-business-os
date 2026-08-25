'use client';

import { useEffect, useState } from 'react';
import type { WorkforceStaffMessage } from '@/lib/workforce/staff-messages';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ActionsMenu, ConfirmDialog, HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { tManagerDashboard } from './manager-dashboard-i18n';

export interface StaffMessagesPopupProps {
  open: boolean;
  onClose: () => void;
  /** Every non-deleted thread's messages, tenant-scoped, RLS-scoped to the caller's manage-permission location. `null` when the read failed. */
  messages: WorkforceStaffMessage[] | null;
  staffById: Map<string, WorkforceStaffManageEntry>;
  timeZone: string;
  isPending: boolean;
  pendingAction: string | null;
  onMarkRead: (messageId: string) => void;
  onArchive: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onSend: (employeeId: string, body: string) => void;
  lang: Lang;
}

interface ThreadSummary {
  employeeId: string;
  lastMessage: WorkforceStaffMessage;
  unreadCount: number;
}

/** One row per employee with any non-deleted message, most-recent first. Unread count = staff-authored, unread, non-archived messages in that thread -- mirrors the Manager Attention layer's own "who/what" queue derivation, pure client-side over already-loaded data. */
function buildThreadSummaries(messages: WorkforceStaffMessage[]): ThreadSummary[] {
  const byEmployee = new Map<string, WorkforceStaffMessage[]>();
  for (const m of messages) {
    if (m.deletedAt) continue;
    const list = byEmployee.get(m.employeeId) ?? [];
    list.push(m);
    byEmployee.set(m.employeeId, list);
  }
  const summaries: ThreadSummary[] = [];
  for (const [employeeId, list] of byEmployee.entries()) {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastMessage = sorted[sorted.length - 1];
    if (!lastMessage) continue;
    const unreadCount = list.filter((m) => m.senderRole === 'staff' && !m.isRead && !m.archivedAt).length;
    summaries.push({ employeeId, lastMessage, unreadCount });
  }
  return summaries.sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
}

const threadRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  background: colors.surface,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left' as const,
  font: 'inherit',
};

const unreadBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 20,
  height: 20,
  padding: '0 6px',
  borderRadius: 999,
  background: colors.danger,
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
};

const bubbleRowStyle = (isManager: boolean) => ({
  display: 'flex',
  justifyContent: isManager ? 'flex-end' : 'flex-start',
  gap: 8,
});

const bubbleStyle = (isManager: boolean) => ({
  maxWidth: '80%',
  borderRadius: 10,
  padding: '8px 12px',
  background: isManager ? colors.accentMuted : colors.surfaceElevated,
  border: `1px solid ${colors.border}`,
});

/**
 * Manager "Mail" popup (Staff<->Manager Mail module) -- two-level view
 * inside one `Modal` (local `selectedEmployeeId` state toggles between
 * them). Modeled structurally on `correction-requests-popup.tsx` (`Modal` +
 * `HelpIconButton` + `usePopupOpenTiming`, `pendingAction` string-key
 * pattern), but two-level (thread list -> thread view) instead of flat.
 * Per-message Archive/Delete live behind an `ActionsMenu` (`•••`), matching
 * the ORUWA design-system charter's "rare/dangerous actions behind a menu"
 * rule; Delete confirms through `ConfirmDialog`.
 */
export function StaffMessagesPopup({
  open,
  onClose,
  messages,
  staffById,
  timeZone,
  isPending,
  pendingAction,
  onMarkRead,
  onArchive,
  onDelete,
  onSend,
  lang,
}: StaffMessagesPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  usePopupOpenTiming(open, 'staff-messages');
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [composeValue, setComposeValue] = useState('');

  useEffect(() => {
    if (!open) {
      setSelectedEmployeeId(null);
      setComposeValue('');
    }
  }, [open]);

  const allMessages = messages ?? [];
  const threads = buildThreadSummaries(allMessages);
  const threadMessages = selectedEmployeeId
    ? allMessages.filter((m) => m.employeeId === selectedEmployeeId && !m.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];

  // Opening a thread marks every unread staff-authored message in it read --
  // mirrors CorrectionRequestsPopup's "open = act on it" model.
  useEffect(() => {
    if (!selectedEmployeeId) return;
    for (const m of allMessages) {
      if (m.employeeId === selectedEmployeeId && m.senderRole === 'staff' && !m.isRead && !m.deletedAt) onMarkRead(m.messageId);
    }
    // Only re-run when the selected thread changes -- marking read must not
    // loop on every `allMessages` prop update (e.g. after a reply's own
    // `router.refresh()`). Deliberately omits `allMessages`/`onMarkRead`
    // from the dependency array for that reason.
  }, [selectedEmployeeId]);

  function openThread(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    setComposeValue('');
  }

  function backToThreads() {
    setSelectedEmployeeId(null);
    setComposeValue('');
  }

  function handleSend() {
    const body = composeValue.trim();
    if (!body || !selectedEmployeeId) return;
    onSend(selectedEmployeeId, body);
    setComposeValue('');
  }

  const sending = selectedEmployeeId ? pendingAction === `send-message-${selectedEmployeeId}` : false;
  const title = selectedEmployeeId
    ? (staffById.get(selectedEmployeeId)?.name ?? t('mailHeading'))
    : t('mailHeading');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleAdornment={<HelpIconButton ariaLabel={t('mailPopupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(760px, 96vw)"
      closeLabel={t('cancel')}
    >
      {selectedEmployeeId === null ? (
        threads.length === 0 ? (
          <p style={{ margin: 0, ...mutedText }}>{t('mailEmptyThreads')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {threads.map((thread) => {
              const staffName = staffById.get(thread.employeeId)?.name ?? thread.employeeId;
              const preview = thread.lastMessage.body.length > 80 ? `${thread.lastMessage.body.slice(0, 80)}…` : thread.lastMessage.body;
              const localTime = utcIsoToLocalDateTime(thread.lastMessage.createdAt, timeZone);
              return (
                <button key={thread.employeeId} type="button" style={threadRowStyle} className={hoverStyles.buttonSecondary} onClick={() => openThread(thread.employeeId)}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{staffName}</div>
                    <div style={{ ...mutedText, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>
                    <div style={{ ...mutedText, fontSize: 12 }}>{localTime.workDate} {localTime.localTime}</div>
                  </div>
                  {thread.unreadCount > 0 ? <span style={unreadBadgeStyle}>{thread.unreadCount}</span> : null}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" className={hoverStyles.buttonSecondary} style={{ ...buttonSecondary, alignSelf: 'flex-start' }} onClick={backToThreads}>
            {t('mailBackToThreads')}
          </button>

          {threadMessages.length === 0 ? (
            <p style={{ margin: 0, ...mutedText }}>{t('mailEmptyThreads')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {threadMessages.map((m) => {
                const isManager = m.senderRole === 'manager';
                const localTime = utcIsoToLocalDateTime(m.createdAt, timeZone);
                return (
                  <div key={m.messageId} style={bubbleRowStyle(isManager)}>
                    <div style={bubbleStyle(isManager)}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ ...mutedText, fontSize: 11 }}>{localTime.workDate} {localTime.localTime}{m.archivedAt ? ` · ${t('mailArchivedTag')}` : ''}</span>
                        <ActionsMenu
                          triggerLabel={t('mailMoreActionsAriaLabel')}
                          items={[
                            ...(!m.isRead
                              ? [{ label: t('mailMarkRead'), onClick: () => onMarkRead(m.messageId), disabled: isPending }]
                              : []),
                            { label: t('mailArchive'), onClick: () => onArchive(m.messageId), disabled: isPending },
                            { label: t('mailDelete'), onClick: () => setConfirmDeleteId(m.messageId), danger: true, disabled: isPending },
                          ]}
                        />
                      </div>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              style={{ ...input, minHeight: 64, resize: 'vertical' }}
              maxLength={500}
              value={composeValue}
              onChange={(event) => setComposeValue(event.target.value)}
              placeholder={t('mailComposePlaceholder')}
            />
            <button
              type="button"
              className={hoverStyles.buttonPrimary}
              style={!composeValue.trim() || isPending ? buttonDisabled : buttonPrimary}
              disabled={!composeValue.trim() || isPending}
              onClick={handleSend}
            >
              {sending ? t('mailSending') : t('mailSend')}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={t('mailDeleteConfirmTitle')}
        confirmLabel={t('mailDelete')}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) onDelete(id);
        }}
      >
        {t('mailDeleteConfirmBody')}
      </ConfirmDialog>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('mailPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('mailPopupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}

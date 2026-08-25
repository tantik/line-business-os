'use client';

import { useEffect, useState, useTransition } from 'react';
import type { WorkforceStaffMessage } from '@/lib/workforce/staff-messages';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { archiveStaffMessageAction, markStaffMessageReadAction, submitStaffMessage } from '@/lib/workforce/staff-messages-actions';
import { ActionsMenu, HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonDisabled, buttonPrimary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { tStaffDashboard } from './staff-dashboard-i18n';

export interface StaffMailPopupProps {
  open: boolean;
  onClose: () => void;
  /** The caller's own single thread (self-scoped by RLS), not date-filtered. `null` when the read failed. */
  messages: WorkforceStaffMessage[] | null;
  timeZone: string;
  lang: Lang;
  /** Refreshes the Staff page's own server-fetched message list (e.g. `router.refresh()`) -- this popup manages its own writes/pending state (matching `RecipesPopup`/`InventoryPopup`'s convention on this same page), it just needs the parent to re-fetch fresh data afterward. */
  onChange: () => void;
}

const bubbleRowStyle = (isStaff: boolean) => ({
  display: 'flex',
  justifyContent: isStaff ? 'flex-end' : 'flex-start',
  gap: 8,
});

const bubbleStyle = (isStaff: boolean) => ({
  maxWidth: '80%',
  borderRadius: 10,
  padding: '8px 12px',
  background: isStaff ? colors.accentMuted : colors.surfaceElevated,
  border: `1px solid ${colors.border}`,
});

/**
 * Staff "Mail" popup (Staff<->Manager Mail module) -- single-thread version
 * of the Manager popup's thread view: just "the Manager" as counterparty
 * (multiple manager-permission holders share and reply into the same
 * thread, labeled generically as "マネージャー" -- no per-manager name
 * lookup needed). Replaces the deleted `DailyMessageForm` card entirely;
 * mounted alongside the other Staff popups, opened from the 4th
 * `EntryPointsCard` button. No Delete: Founder direction (2026-08-25) -- a
 * message is archived, never deleted by either side individually; see the
 * matching note in `manager/staff-messages-popup.tsx`. Self-contained
 * pending state (own
 * `useTransition`, `onChange` prop for the parent's `router.refresh()`),
 * matching `RecipesPopup`/`InventoryPopup`'s convention on this same page --
 * unlike the Manager popup, this Staff dashboard has no shared
 * `isPending`/`pendingAction` state lifted to its client component.
 */
export function StaffMailPopup({ open, onClose, messages, timeZone, lang, onChange }: StaffMailPopupProps) {
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);
  usePopupOpenTiming(open, 'staff-mail');
  const [helpOpen, setHelpOpen] = useState(false);
  const [composeValue, setComposeValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  // No generic "close" key exists in this dashboard's dictionary yet --
  // matches `monthly-shift-preference-modal.tsx`'s own inline JA/EN
  // fallback for the same reason, rather than adding one just for this
  // popup's Modal chrome.
  const closeLabel = lang === 'ja' ? '閉じる' : 'Close';

  const visibleMessages = (messages ?? []).filter((m) => !m.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Opening the popup marks every unread manager-authored message read.
  useEffect(() => {
    if (!open) {
      setComposeValue('');
      return;
    }
    for (const m of messages ?? []) {
      if (m.senderRole === 'manager' && !m.isRead && !m.deletedAt) {
        const formData = new FormData();
        formData.set('messageId', m.messageId);
        startTransition(async () => {
          await markStaffMessageReadAction(formData);
          onChange();
        });
      }
    }
    // Only re-run on open/close -- marking read must not loop on every
    // `messages` prop update (e.g. after this popup's own send/reply).
    // Deliberately omits `messages`/`onChange` from the dependency array
    // for that reason.
  }, [open]);

  function handleArchive(messageId: string) {
    setPendingAction(`archive-${messageId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('messageId', messageId);
      await archiveStaffMessageAction(formData);
      onChange();
      setPendingAction(null);
    });
  }

  function handleSend() {
    const body = composeValue.trim();
    if (!body) return;
    setPendingAction('send');
    startTransition(async () => {
      const formData = new FormData();
      formData.set('body', body);
      const result = await submitStaffMessage(formData);
      if (result.status === 'success') setComposeValue('');
      onChange();
      setPendingAction(null);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('mailHeading')}
      titleAdornment={<HelpIconButton ariaLabel={t('mailHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(600px, 96vw)"
      closeLabel={closeLabel}
    >
      {visibleMessages.length === 0 ? (
        <p style={{ margin: 0, ...mutedText }}>{t('mailEmpty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleMessages.map((m) => {
            const isStaff = m.senderRole === 'staff';
            const localTime = utcIsoToLocalDateTime(m.createdAt, timeZone);
            return (
              <div key={m.messageId} style={bubbleRowStyle(isStaff)}>
                <div style={bubbleStyle(isStaff)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ ...mutedText, fontSize: 11 }}>
                      {isStaff ? t('mailYouLabel') : t('mailManagerLabel')} · {localTime.workDate} {localTime.localTime}
                      {m.archivedAt ? ` · ${t('mailArchivedTag')}` : ''}
                    </span>
                    <ActionsMenu
                      triggerLabel={t('mailMoreActionsAriaLabel')}
                      items={[
                        { label: t('mailArchive'), onClick: () => handleArchive(m.messageId), disabled: isPending },
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

      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 12, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          {pendingAction === 'send' ? t('mailSending') : t('mailSend')}
        </button>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('mailHelpAriaLabel')} closeLabel={closeLabel} width="min(420px, 94vw)">
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{t('mailHelpBody')}</p>
      </Modal>
    </Modal>
  );
}

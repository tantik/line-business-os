'use client';

import { useRef, useState } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { Modal } from '@/components/shared/design-kit';
import { badgeStyle, buttonDisabled, buttonSecondary, card, colors, input, mutedText, tableCell, tableHeaderCell } from '@/lib/ui/theme';
import { buttonDanger } from '../_ui/workforce-theme';
import { tManagerDashboard } from './manager-dashboard-i18n';
import { filterStaffEntries, type StaffStatusFilter } from './staff-filter';
import { StaffForm } from './staff-form';
import { LineLinkForm } from './line-link-form';
import { InvitationCell } from './invitation-cell';
import styles from './manager-dashboard.module.css';

export interface ManageStaffPopupProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  staff: WorkforceStaffManageEntry[] | null;
  isLineLinkedByEmployeeId: Map<string, boolean>;
  latestInvitationByEmployeeId: Map<string, WorkforceEmployeeInvitation>;
  isPending: boolean;
  pendingAction: string | null;
  onSetActive: (staffId: string, nextActive: boolean) => void;
  onChange: () => void;
  lang: Lang;
}

const FILTER_TABS: { value: StaffStatusFilter; labelKey: 'statusActive' | 'statusInactive' | 'filterAll' }[] = [
  { value: 'active', labelKey: 'statusActive' },
  { value: 'inactive', labelKey: 'statusInactive' },
  { value: 'all', labelKey: 'filterAll' },
];

/**
 * Manage-staff popup (WP A4, Cafe Manager parity mission): wraps the
 * existing Staff list/Add/Edit form -- previously always inline on the
 * Manager dashboard -- in a design-kit `Modal`, and adds the search +
 * Active/Deactivated/All filter the dashboard never had. That filter is
 * also what Gate 1 needed: without it, a deactivated or duplicate-invitation
 * employee row had no reliable way to be found and its invitation revoked
 * via the existing `InvitationCell` "取り消す" button (see
 * `manager-dashboard-i18n.ts`'s own history and the mission plan's Gate 1
 * section -- investigated, not a bug, cleanup was deferred here).
 *
 * Deliberately scoped down from the plan's full "3-button row" text: only
 * the Staff popup ships in this WP. Recipes/Inventory popups (WP A5) don't
 * exist yet, so a 3-button row with two dead buttons would be premature --
 * same pragmatic scoping call WP A3 already made for its section reorder.
 */
export function ManageStaffPopup({
  open,
  onClose,
  locationId,
  staff,
  isLineLinkedByEmployeeId,
  latestInvitationByEmployeeId,
  isPending,
  pendingAction,
  onSetActive,
  onChange,
  lang,
}: ManageStaffPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [statusFilter, setStatusFilter] = useState<StaffStatusFilter>('active');
  const [query, setQuery] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const addStaffButtonRef = useRef<HTMLButtonElement>(null);
  // Table and card Edit buttons for the same staffId both render at once
  // (CSS media query picks which is visible) -- keep both refs so
  // focus-restore targets whichever one is actually visible/focusable at
  // close time, not whichever mounted last. Same convention the schedule
  // grid's cell editor already established.
  const editStaffButtonRefs = useRef(new Map<string, { table: HTMLButtonElement | null; card: HTMLButtonElement | null }>());

  function editStaffButtonRef(staffId: string, variant: 'table' | 'card') {
    return (el: HTMLButtonElement | null) => {
      const entry = editStaffButtonRefs.current.get(staffId) ?? { table: null, card: null };
      entry[variant] = el;
      editStaffButtonRefs.current.set(staffId, entry);
    };
  }

  function closeAddStaffForm() {
    setAddingStaff(false);
    requestAnimationFrame(() => addStaffButtonRef.current?.focus());
  }

  function closeEditStaffForm(staffId: string) {
    setEditingStaffId(null);
    requestAnimationFrame(() => {
      const entry = editStaffButtonRefs.current.get(staffId);
      const target = entry?.table?.offsetParent ? entry.table : entry?.card?.offsetParent ? entry.card : null;
      target?.focus();
    });
  }

  // A nested Add/Edit form isn't a separate dialog, so it has no Escape/
  // backdrop-close of its own -- instead the Modal's single onClose (every
  // close path: x, Escape, backdrop) backs out one level at a time: close
  // whichever inline form is open first, only close the whole popup once
  // neither is.
  function handleModalClose() {
    if (addingStaff) {
      closeAddStaffForm();
      return;
    }
    if (editingStaffId) {
      closeEditStaffForm(editingStaffId);
      return;
    }
    onClose();
  }

  const filteredStaff = staff ? filterStaffEntries(staff, { status: statusFilter, query }) : [];

  return (
    <Modal open={open} onClose={handleModalClose} title={t('staffHeading')} width="min(1100px, 96vw)" closeLabel={t('cancel')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...input, marginTop: 0, width: 220 }}
            type="search"
            placeholder={t('searchStaffPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('searchStaffPlaceholder')}
          />
          <div role="group" aria-label={t('filterAll')} style={{ display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 999, overflow: 'hidden' }}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={statusFilter === tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  border: 0,
                  minHeight: 36,
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: statusFilter === tab.value ? colors.accent : 'transparent',
                  color: statusFilter === tab.value ? '#fff' : colors.textMuted,
                }}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>
        {staff !== null && !addingStaff ? (
          <button ref={addStaffButtonRef} type="button" style={buttonSecondary} onClick={() => setAddingStaff(true)}>
            {t('addStaff')}
          </button>
        ) : null}
      </div>

      {addingStaff ? (
        <StaffForm
          locationId={locationId}
          onSuccess={() => {
            closeAddStaffForm();
            onChange();
          }}
          onCancel={closeAddStaffForm}
        />
      ) : null}

      {staff === null ? (
        <p style={{ margin: '16px 0 0', ...mutedText }}>{t('staffUnavailable')}</p>
      ) : staff.length === 0 ? (
        <p style={{ margin: '16px 0 0', ...mutedText }}>{t('staffEmpty')}</p>
      ) : filteredStaff.length === 0 ? (
        <p style={{ margin: '16px 0 0', ...mutedText }}>{t('noStaffMatch')}</p>
      ) : (
        <>
          <div className={styles.tableView} style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colName')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colPosition')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colEmploymentType')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStatus')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colLine')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>アクセス</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s) => {
                  if (editingStaffId === s.staffId) {
                    return (
                      <tr key={s.staffId}>
                        <td colSpan={7} style={tableCell}>
                          <StaffForm
                            locationId={locationId}
                            employee={s}
                            onSuccess={() => {
                              closeEditStaffForm(s.staffId);
                              onChange();
                            }}
                            onCancel={() => closeEditStaffForm(s.staffId)}
                          />
                        </td>
                      </tr>
                    );
                  }
                  const togglingActive = pendingAction === `active-${s.staffId}`;
                  return (
                    <tr key={s.staffId}>
                      <td style={tableCell}>{s.name}</td>
                      <td style={tableCell}>{s.positionLabel ?? '-'}</td>
                      <td style={tableCell}>{s.employmentType ?? '-'}</td>
                      <td style={tableCell}>
                        <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? t('statusActive') : t('statusInactive')}</span>
                      </td>
                      <td style={tableCell}>
                        <LineLinkForm
                          employeeId={s.staffId}
                          isLinked={isLineLinkedByEmployeeId.get(s.staffId) ?? false}
                          onSuccess={onChange}
                          lang={lang}
                        />
                      </td>
                      <td style={tableCell}>
                        <InvitationCell
                          hasAccountAccess={s.hasAccountAccess}
                          employeeId={s.staffId}
                          invitation={latestInvitationByEmployeeId.get(s.staffId) ?? null}
                          onChange={onChange}
                        />
                      </td>
                      <td style={tableCell}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            ref={editStaffButtonRef(s.staffId, 'table')}
                            type="button"
                            style={buttonSecondary}
                            disabled={isPending}
                            onClick={() => setEditingStaffId(s.staffId)}
                          >
                            {t('edit')}
                          </button>
                          <button
                            type="button"
                            style={isPending && togglingActive ? buttonDisabled : s.isActive ? buttonDanger : buttonSecondary}
                            disabled={isPending}
                            onClick={() => onSetActive(s.staffId, !s.isActive)}
                          >
                            {togglingActive ? t('saving') : s.isActive ? t('deactivate') : t('activate')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.cardView} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredStaff.map((s) => {
              if (editingStaffId === s.staffId) {
                return (
                  <div key={s.staffId} style={{ ...card, marginTop: 0 }}>
                    <StaffForm
                      locationId={locationId}
                      employee={s}
                      onSuccess={() => {
                        closeEditStaffForm(s.staffId);
                        onChange();
                      }}
                      onCancel={() => closeEditStaffForm(s.staffId)}
                    />
                  </div>
                );
              }
              const togglingActive = pendingAction === `active-${s.staffId}`;
              const meta = [s.positionLabel, s.employmentType].filter(Boolean).join(' · ');
              return (
                <div key={s.staffId} style={{ ...card, marginTop: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 15 }}>{s.name}</strong>
                    <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? t('statusActive') : t('statusInactive')}</span>
                  </div>
                  {meta ? <p style={{ margin: '4px 0 0', fontSize: 13, ...mutedText }}>{meta}</p> : null}
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <LineLinkForm
                      employeeId={s.staffId}
                      isLinked={isLineLinkedByEmployeeId.get(s.staffId) ?? false}
                      onSuccess={onChange}
                      lang={lang}
                    />
                    <InvitationCell
                      hasAccountAccess={s.hasAccountAccess}
                      employeeId={s.staffId}
                      invitation={latestInvitationByEmployeeId.get(s.staffId) ?? null}
                      onChange={onChange}
                    />
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      ref={editStaffButtonRef(s.staffId, 'card')}
                      type="button"
                      style={{ ...buttonSecondary, flex: '1 1 auto' }}
                      disabled={isPending}
                      onClick={() => setEditingStaffId(s.staffId)}
                    >
                      {t('edit')}
                    </button>
                    <button
                      type="button"
                      style={{ ...(isPending && togglingActive ? buttonDisabled : s.isActive ? buttonDanger : buttonSecondary), flex: '1 1 auto' }}
                      disabled={isPending}
                      onClick={() => onSetActive(s.staffId, !s.isActive)}
                    >
                      {togglingActive ? t('saving') : s.isActive ? t('deactivate') : t('activate')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

'use client';

import { useState, useTransition } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ConfirmDialog, HelpIconButton, Modal } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import type { BadgeTone } from '@/lib/ui/theme';
import { alertDanger, badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonDanger } from '../_ui/workforce-theme';
import { deleteEmployee } from '@/lib/workforce/staff-actions';
import { tManagerDashboard } from './manager-dashboard-i18n';
import { filterStaffEntries, type StaffStatusFilter } from './staff-filter';
import { StaffForm, localizedFormError } from './staff-form';
import { LineLinkForm } from './line-link-form';
import { InvitationCell } from './invitation-cell';

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

type T = (key: Parameters<typeof tManagerDashboard>[1]) => string;
type View = { kind: 'list' } | { kind: 'add' } | { kind: 'detail'; staffId: string };

const FILTER_TABS: { value: StaffStatusFilter; labelKey: 'statusActive' | 'statusInactive' | 'filterAll' }[] = [
  { value: 'active', labelKey: 'statusActive' },
  { value: 'inactive', labelKey: 'statusInactive' },
  { value: 'all', labelKey: 'filterAll' },
];

/** Read-only summary for the compact row -- distinct from `InvitationCell`, the interactive bind/invite control only ever rendered inside the detail view below (now bilingual too, see invitation-cell.tsx). */
function accessBadge(
  hasAccountAccess: boolean,
  invitation: WorkforceEmployeeInvitation | null,
  t: T,
): { label: string; tone: BadgeTone } {
  if (hasAccountAccess) return { label: t('accessActiveShort'), tone: 'active' };
  if (invitation && invitation.status === 'pending' && !invitation.isExpired) return { label: t('accessPendingShort'), tone: 'neutral' };
  if (invitation && invitation.status === 'pending' && invitation.isExpired) return { label: t('accessExpiredShort'), tone: 'inactive' };
  return { label: t('accessNoneShort'), tone: 'inactive' };
}

function StaffAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      aria-hidden
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: colors.accentMuted,
        color: colors.accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

/**
 * Manage-staff popup (Cafe Manager UI/UX Parity mission, module-by-module
 * redesign, 2026-08-21): replaces the old always-expanded table/card list
 * (every row showing its full `LineLinkForm` + `InvitationCell` inline --
 * ~7 columns of controls always on screen, the Founder's own "not
 * beautiful, want it compact" complaint) with a compact row (avatar, name,
 * meta, three summary badges) that opens a detail popup on click, same
 * list-detail-swap-inside-one-Modal shape the Recipes module already
 * established. Unlike Recipes, staff detail needs no separate lazy fetch --
 * `WorkforceStaffManageEntry` already carries every field the detail view
 * needs, so `detail` view just looks the row up by id from the already-
 * loaded `staff` array.
 *
 * 2026-08-21 follow-up polish (same session): the row itself carries no
 * actions at all now, not even a `•••` -- every row click opens the detail
 * popup, and Deactivate/Reactivate (plus the existing Delete-permanently,
 * via `StaffForm`) live there instead. Popup width matched to Recipes'
 * `min(1100px, 96vw)` (was a narrower `720px` in the first pass).
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
  const t: T = (key) => tManagerDashboard(lang, key);
  usePopupOpenTiming(open, 'manage-staff');
  const [statusFilter, setStatusFilter] = useState<StaffStatusFilter>('active');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [confirmToggleActiveId, setConfirmToggleActiveId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Lifted from `StaffForm`: the actual Save button now lives in this
  // popup's own bottom action bar (see the `formId`/`form=` doc comment on
  // `StaffFormProps`), so it needs to know the fields-form's pending/error
  // state to render correctly.
  const [formPending, setFormPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Delete-permanently, moved out of `StaffForm` into this popup's danger
  // zone (see the module doc comment).
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const filteredStaff = staff ? filterStaffEntries(staff, { status: statusFilter, query }) : [];
  const detailStaff = view.kind === 'detail' ? (staff ?? []).find((s) => s.staffId === view.staffId) ?? null : null;

  function openDetail(staffId: string) {
    setFormError(null);
    setFormPending(false);
    setDeleteError(null);
    setConfirmDeleteOpen(false);
    setView({ kind: 'detail', staffId });
  }

  function backToList() {
    setView({ kind: 'list' });
  }

  function handleDelete(staffId: string) {
    setDeleteError(null);
    const formData = new FormData();
    formData.set('staffId', staffId);
    startDeleteTransition(async () => {
      const result = await deleteEmployee(formData);
      if (result.status === 'success') {
        setConfirmDeleteOpen(false);
        backToList();
        onChange();
      } else {
        setConfirmDeleteOpen(false);
        setDeleteError(result.status === 'blocked_by_history' ? t('staffBlockedByHistory') : localizedFormError(result, t));
      }
    });
  }

  // Same shape as the Recipes popup's own `handleClose`: the Modal's single
  // onClose (x, Escape, backdrop) backs out one level at a time -- only
  // actually closes the whole popup once already on the list.
  function handleModalClose() {
    if (view.kind !== 'list') {
      backToList();
      return;
    }
    onClose();
  }

  const title = view.kind === 'list' ? t('staffHeading') : view.kind === 'add' ? t('addStaffSubmit') : detailStaff?.name ?? t('staffHeading');

  return (
    <Modal
      open={open}
      onClose={handleModalClose}
      title={title}
      titleAdornment={view.kind === 'list' ? <HelpIconButton ariaLabel={t('staffPopupHelpAriaLabel')} onClick={() => setHelpOpen(true)} /> : undefined}
      width="min(1100px, 96vw)"
      closeLabel={t('cancel')}
    >
      {view.kind === 'add' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <StaffForm locationId={locationId} formId="staff-form-new" isLineLinked={false} onSuccess={() => { backToList(); onChange(); }} onPendingChange={setFormPending} onErrorChange={setFormError} />
          <div style={{ display: 'flex', gap: 8 }}>
            <LoadingButton
              type="submit"
              form="staff-form-new"
              pending={formPending}
              pendingLabel={t('saving')}
              style={buttonPrimary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonPrimary}
            >
              {t('addStaffSubmit')}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={backToList} disabled={formPending}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : view.kind === 'detail' && detailStaff ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <StaffAvatar name={detailStaff.name} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={badgeStyle(detailStaff.isActive ? 'active' : 'inactive')}>{detailStaff.isActive ? t('statusActive') : t('statusInactive')}</span>
              <span style={badgeStyle(isLineLinkedByEmployeeId.get(detailStaff.staffId) ? 'active' : 'neutral')}>
                {isLineLinkedByEmployeeId.get(detailStaff.staffId) ? t('lineLinkedShort') : t('lineNotLinkedShort')}
              </span>
              {(() => {
                const badge = accessBadge(detailStaff.hasAccountAccess, latestInvitationByEmployeeId.get(detailStaff.staffId) ?? null, t);
                return <span style={badgeStyle(badge.tone)}>{badge.label}</span>;
              })()}
            </div>
          </div>

          <StaffForm
            locationId={locationId}
            employee={detailStaff}
            formId={`staff-form-${detailStaff.staffId}`}
            isLineLinked={isLineLinkedByEmployeeId.get(detailStaff.staffId) ?? false}
            onSuccess={() => {
              backToList();
              onChange();
            }}
            onPendingChange={setFormPending}
            onErrorChange={setFormError}
          />

          {isLineLinkedByEmployeeId.get(detailStaff.staffId) ? (
            <section>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('colLine')}</h3>
              <LineLinkForm employeeId={detailStaff.staffId} lang={lang} onSuccess={onChange} />
            </section>
          ) : null}

          <section>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('accessSectionHeading')}</h3>
            <InvitationCell
              hasAccountAccess={detailStaff.hasAccountAccess}
              employeeId={detailStaff.staffId}
              invitation={latestInvitationByEmployeeId.get(detailStaff.staffId) ?? null}
              onChange={onChange}
              lang={lang}
            />
          </section>

          <section style={{ paddingTop: 4, borderTop: `1px solid ${colors.border}` }}>
            <h3 style={{ margin: '14px 0 8px', fontSize: 14, color: colors.dangerText }}>{t('dangerZoneHeading')}</h3>
            {deleteError ? <div style={{ ...alertDanger, marginBottom: 8 }}>{deleteError}</div> : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <LoadingButton
                type="button"
                pending={isDeletePending}
                pendingLabel={t('deletingStaff')}
                style={buttonDanger}
                pendingStyle={buttonDisabled}
                className={hoverStyles.buttonDanger}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                {t('deleteStaffButton')}
              </LoadingButton>
              {detailStaff.isActive ? (
                <button
                  type="button"
                  className={hoverStyles.buttonSecondary}
                  style={pendingAction === `active-${detailStaff.staffId}` ? buttonDisabled : buttonSecondary}
                  disabled={isPending}
                  onClick={() => setConfirmToggleActiveId(detailStaff.staffId)}
                >
                  {pendingAction === `active-${detailStaff.staffId}` ? t('saving') : t('deactivate')}
                </button>
              ) : (
                <button
                  type="button"
                  className={hoverStyles.buttonSecondary}
                  style={pendingAction === `active-${detailStaff.staffId}` ? buttonDisabled : buttonSecondary}
                  disabled={isPending}
                  onClick={() => onSetActive(detailStaff.staffId, true)}
                >
                  {pendingAction === `active-${detailStaff.staffId}` ? t('saving') : t('activate')}
                </button>
              )}
            </div>
            {/* Warn before the click, not just on a failed delete attempt -- same wording the RPC guard produces on an actual blocked attempt, so the two never disagree. */}
            {detailStaff.hasProtectedHistory ? <p style={{ margin: '6px 0 0', fontSize: 12, ...mutedText }}>{t('staffBlockedByHistory')}</p> : null}
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
            {formError ? <div style={alertDanger}>{formError}</div> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <LoadingButton
                type="submit"
                form={`staff-form-${detailStaff.staffId}`}
                pending={formPending}
                pendingLabel={t('saving')}
                style={buttonPrimary}
                pendingStyle={buttonDisabled}
                className={hoverStyles.buttonPrimary}
              >
                {t('saveChanges')}
              </LoadingButton>
              <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={backToList} disabled={formPending}>
                {t('cancel')}
              </button>
            </div>
          </div>

          <ConfirmDialog
            open={confirmDeleteOpen}
            title={t('confirmDeleteStaffTitle')}
            confirmLabel={t('deleteStaffButton')}
            cancelLabel={t('cancel')}
            pending={isDeletePending}
            danger
            onCancel={() => setConfirmDeleteOpen(false)}
            onConfirm={() => handleDelete(detailStaff.staffId)}
          >
            {t('confirmDeleteStaffBody')}
          </ConfirmDialog>
        </div>
      ) : (
        <>
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
              <div
                role="group"
                aria-label={t('filterAll')}
                style={{ display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 999, overflow: 'hidden' }}
              >
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
            {staff !== null ? (
              <button type="button" className={hoverStyles.buttonPrimary} style={buttonPrimary} onClick={() => setView({ kind: 'add' })}>
                {t('addStaff')}
              </button>
            ) : null}
          </div>

          {staff === null ? (
            <p style={{ margin: '16px 0 0', ...mutedText }}>{t('staffUnavailable')}</p>
          ) : staff.length === 0 ? (
            <p style={{ margin: '16px 0 0', ...mutedText }}>{t('staffEmpty')}</p>
          ) : filteredStaff.length === 0 ? (
            <p style={{ margin: '16px 0 0', ...mutedText }}>{t('noStaffMatch')}</p>
          ) : (
            <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {filteredStaff.map((s) => {
                const meta = [s.positionLabel, s.employmentType].filter(Boolean).join(' · ');
                const access = accessBadge(s.hasAccountAccess, latestInvitationByEmployeeId.get(s.staffId) ?? null, t);
                return (
                  <li
                    key={s.staffId}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(s.staffId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDetail(s.staffId);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 10px',
                      borderRadius: 8,
                      background: colors.surfaceElevated,
                      flexWrap: 'wrap',
                      cursor: 'pointer',
                      opacity: s.isActive ? 1 : 0.65,
                    }}
                  >
                    <StaffAvatar name={s.name} />
                    <div style={{ minWidth: 140, flex: '1 1 160px' }}>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</strong>
                      {meta ? (
                        <div style={{ ...mutedText, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {meta}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? t('statusActive') : t('statusInactive')}</span>
                      <span style={badgeStyle(isLineLinkedByEmployeeId.get(s.staffId) ? 'active' : 'neutral')}>
                        {isLineLinkedByEmployeeId.get(s.staffId) ? t('lineLinkedShort') : t('lineNotLinkedShort')}
                      </span>
                      <span style={badgeStyle(access.tone)}>{access.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmToggleActiveId !== null}
        title={t('confirmDeactivate')}
        confirmLabel={t('deactivate')}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmToggleActiveId(null)}
        onConfirm={() => {
          if (confirmToggleActiveId) onSetActive(confirmToggleActiveId, false);
          setConfirmToggleActiveId(null);
        }}
      >
        {staff?.find((s) => s.staffId === confirmToggleActiveId)?.name ?? ''}
      </ConfirmDialog>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('staffPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('staffPopupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}

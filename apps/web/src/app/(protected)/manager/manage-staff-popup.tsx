'use client';

import { useState } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ActionsMenu, ConfirmDialog, HelpIconButton, Modal } from '@/components/shared/design-kit';
import type { BadgeTone } from '@/lib/ui/theme';
import { badgeStyle, buttonPrimary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { tManagerDashboard } from './manager-dashboard-i18n';
import { filterStaffEntries, type StaffStatusFilter } from './staff-filter';
import { StaffForm } from './staff-form';
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

/** Read-only summary for the compact row -- distinct from `InvitationCell`, which stays the interactive (and Founder-decided JA-only) bind/invite control, only ever rendered inside the detail view below. */
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
 * Deactivate/Reactivate moved off the row (previously an always-visible
 * danger-colored button) into a `•••` `ActionsMenu`, matching the Inventory
 * module's row-actions spec: frequent/central action (here: opening the
 * detail popup, which owns the actual identity/LINE/access edits) stays a
 * direct row interaction; rare/binary-state actions go behind `•••`.
 * "Delete permanently" stays inside the detail popup only (via the
 * existing, tested `StaffForm`'s own delete flow, including its
 * `hasProtectedHistory` pre-emptive hint) -- not duplicated into the row
 * menu, since it already has real context there that a bare row action
 * would lack.
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

  const filteredStaff = staff ? filterStaffEntries(staff, { status: statusFilter, query }) : [];
  const detailStaff = view.kind === 'detail' ? (staff ?? []).find((s) => s.staffId === view.staffId) ?? null : null;

  function backToList() {
    setView({ kind: 'list' });
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
      width="min(720px, 96vw)"
      closeLabel={t('cancel')}
    >
      {view.kind === 'add' ? (
        <StaffForm
          locationId={locationId}
          onSuccess={() => {
            backToList();
            onChange();
          }}
          onCancel={backToList}
        />
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
            onSuccess={() => {
              backToList();
              onChange();
            }}
            onCancel={backToList}
          />

          <section>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('colLine')}</h3>
            <LineLinkForm
              employeeId={detailStaff.staffId}
              isLinked={isLineLinkedByEmployeeId.get(detailStaff.staffId) ?? false}
              onSuccess={onChange}
              lang={lang}
            />
          </section>

          <section>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('accessSectionHeading')}</h3>
            <InvitationCell
              hasAccountAccess={detailStaff.hasAccountAccess}
              employeeId={detailStaff.staffId}
              invitation={latestInvitationByEmployeeId.get(detailStaff.staffId) ?? null}
              onChange={onChange}
            />
          </section>
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
                const togglingActive = pendingAction === `active-${s.staffId}`;
                const meta = [s.positionLabel, s.employmentType].filter(Boolean).join(' · ');
                const access = accessBadge(s.hasAccountAccess, latestInvitationByEmployeeId.get(s.staffId) ?? null, t);
                return (
                  <li
                    key={s.staffId}
                    role="button"
                    tabIndex={0}
                    onClick={() => setView({ kind: 'detail', staffId: s.staffId })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setView({ kind: 'detail', staffId: s.staffId });
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
                    <div onClick={(event) => event.stopPropagation()}>
                      <ActionsMenu
                        triggerLabel={`${t('colActions')} — ${s.name}`}
                        items={[
                          s.isActive
                            ? {
                                label: togglingActive ? t('saving') : t('deactivate'),
                                onClick: () => setConfirmToggleActiveId(s.staffId),
                                disabled: isPending,
                              }
                            : {
                                label: togglingActive ? t('saving') : t('activate'),
                                onClick: () => onSetActive(s.staffId, true),
                                disabled: isPending,
                              },
                        ]}
                      />
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

'use client';

import { useState, useTransition } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import {
  previewGetStaffManagerData,
  previewPermanentlyDeleteEmployee,
  previewUpsertEmployee,
} from './actions/staff-actions';
import { previewStaffDeleteMessage, previewWriteMessage, type PreviewWriteResult } from './write-result';
import { badgeStyle, buttonPrimary, buttonSecondary, demoColors, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';
import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';
import { PendingOverlay } from '@/components/ui/loading';

/**
 * Phase 1N-4C Slice B2a - preview-specific manager client island for
 * employee create/edit and permanent-delete. Calls only
 * `previewUpsertEmployee`/`previewPermanentlyDeleteEmployee` (never the
 * dashboard `staff-actions.ts`). No tenant/location/role/permission field is
 * ever submitted - `id`/`staffId` are the only client-supplied identifiers,
 * and both are legitimate target-record ids re-verified server-side.
 *
 * Staff lifecycle (Cafe v2.1 final polish): the list view's only two actions
 * are "Edit" and "Delete" for every row, active or deactivated alike -
 * Active/Deactivated status (soft, always reversible, via `isActive` on
 * `previewUpsertEmployee`) is a field inside Edit, never a standalone list
 * button. "Delete" is always `previewPermanentlyDeleteEmployee`, gated by a
 * confirmation dialog, and only succeeds when the employee has zero
 * shift/attendance/request/exchange history (refused otherwise, never a
 * cascade) - a manager who needs to remove someone with real history uses
 * Edit -> Status -> Deactivated instead.
 */
export interface PreviewStaffFormProps {
  staff: WorkforceStaffManageEntry[] | null;
  /**
   * Called with the freshly-refetched roster after a successful save/
   * remove/permanent-delete (via `previewGetStaffManagerData()`, never
   * `router.refresh()`) so an Inventory/Recipes/Schedule re-render never
   * happens as a side effect. Owned by `PreviewStaffRecipeManagement` (the
   * parent that stays mounted across this form's own dialog open/close
   * cycles) rather than by this component itself, since the shared `Modal`
   * unmounts its children on close - state owned here would be silently
   * discarded on every close, reverting to the stale initial-load `staff`
   * prop on next open. Preview Manager architecture, perf phase 2.
   */
  onStaffChanged: (next: WorkforceStaffManageEntry[]) => void;
}

type StaffFilter = 'active' | 'inactive' | 'all';

function toFeedback(lang: Lang, result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: tManager(lang, 'saved') };
  return { ok: false, text: previewWriteMessage(lang, result.status) };
}

export function PreviewStaffForm({ staff, onStaffChanged }: PreviewStaffFormProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<WorkforceStaffManageEntry | null>(null);
  const [permanentDeleteError, setPermanentDeleteError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StaffFilter>('active');
  const [search, setSearch] = useState('');

  const editingEntry = editingId ? (staff ?? []).find((s) => s.staffId === editingId) ?? null : null;
  const filteredByStatus = (staff ?? []).filter((s) => (filter === 'active' ? s.isActive : filter === 'inactive' ? !s.isActive : true));
  const visibleStaff = filteredByStatus.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function refreshStaff() {
    const result = await previewGetStaffManagerData();
    if (result.status === 'success') onStaffChanged(result.data);
  }

  function handleUpsert(formData: FormData) {
    startTransition(async () => {
      const result = await previewUpsertEmployee(formData);
      setFeedback(toFeedback(lang, result));
      if (result.status === 'success') {
        setEditingId(null);
        setMode('list');
        await refreshStaff();
      }
    });
  }

  function handlePermanentDelete(staffId: string) {
    setPermanentDeleteError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('staffId', staffId);
      const result = await previewPermanentlyDeleteEmployee(formData);
      if (result.status === 'success') {
        setPermanentDeleteTarget(null);
        setMode('list');
        setEditingId(null);
        await refreshStaff();
      } else {
        // Kept open (not cleared) when blocked by history, same as
        // Inventory's permanent delete -- the manager should see why right
        // next to the action they just tried.
        setPermanentDeleteError(previewStaffDeleteMessage(lang, result.status));
      }
    });
  }

  return (
    <div>
      {mode === 'list' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 12, ...mutedText }}>{t('staffManagementSubtitle')}</p>
            <button
              type="button"
              style={{ ...buttonPrimary, padding: '8px 14px', fontSize: 13 }}
              onClick={() => {
                setEditingId(null);
                setMode('add');
              }}
            >
              {t('addStaff')}
            </button>
          </div>
          <input
            type="search"
            style={{ ...inputStyle, marginBottom: 12 }}
            placeholder={t('staffSearchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('staffSearchPlaceholder')}
          />
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['active', 'inactive', 'all'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                style={{
                  ...buttonSecondary,
                  padding: '4px 12px',
                  fontSize: 12,
                  ...(filter === option ? { background: demoColors.accent, color: '#fff', borderColor: demoColors.accent } : {}),
                }}
              >
                {t(option === 'active' ? 'staffFilterActive' : option === 'inactive' ? 'staffFilterInactive' : 'staffFilterAll')}
              </button>
            ))}
          </div>
          {feedback ? <p style={{ margin: '0 0 10px', color: feedback.ok ? undefined : demoColors.dangerText }}>{feedback.text}</p> : null}
          {staff === null ? (
            <p style={mutedText}>{t('staffListErrorShort')}</p>
          ) : visibleStaff.length === 0 ? (
            <p style={mutedText}>{search.trim() ? t('staffNoSearchResults') : t('staffListEmptyShort')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {visibleStaff.map((s) => (
                <div
                  key={s.staffId}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: demoColors.surfaceElevated }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: demoColors.textMuted }}>
                      {s.positionLabel || t('roleFallback')} ・{' '}
                      <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? t('active') : t('inactive')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        style={buttonSecondary}
                        onClick={() => {
                          setEditingId(s.staffId);
                          setMode('edit');
                        }}
                        disabled={isPending}
                      >
                        {t('edit')}
                      </button>
                      <button
                        type="button"
                        style={{ ...buttonSecondary, color: demoColors.dangerText }}
                        onClick={() => {
                          setPermanentDeleteError(null);
                          setPermanentDeleteTarget(s);
                        }}
                        disabled={isPending}
                      >
                        {t('deleteStaffButton')}
                      </button>
                    </div>
                    {/* Founder QA F05: warn BEFORE the click, not just after a
                        failed delete attempt - same wording the RPC guard
                        (0056) produces on an actual blocked attempt, so the
                        two never disagree. The button itself stays enabled;
                        this only makes the outcome predictable. */}
                    {s.hasProtectedHistory ? (
                      <span style={{ maxWidth: 220, textAlign: 'right', fontSize: 11, color: demoColors.textMuted }}>
                        {previewStaffDeleteMessage(lang, 'blocked_by_history')}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>{mode === 'edit' ? t('editStaffTitle') : t('addStaffTitle')}</h3>
          <form action={handleUpsert} style={{ display: 'grid', gap: 12, position: 'relative' }}>
            <PendingOverlay visible={isPending} />
            {editingEntry ? <input type="hidden" name="id" value={editingEntry.staffId} /> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <label>{lang === 'ja' ? '姓' : 'Family name'}<input style={inputStyle} name="familyName" defaultValue={editingEntry?.familyName ?? ''} required maxLength={80} /></label>
              <label>{lang === 'ja' ? '名' : 'Given name'}<input style={inputStyle} name="givenName" defaultValue={editingEntry?.givenName ?? ''} required maxLength={80} /></label>
            </div>
            <label>{t('displayName')}<input style={inputStyle} name="name" defaultValue={editingEntry?.name ?? ''} required maxLength={120} key={editingEntry?.staffId ?? 'new'} /></label>
            <label>
              {t('position')}
              <input style={inputStyle} name="positionLabel" defaultValue={editingEntry?.positionLabel ?? ''} maxLength={60} key={`pos-${editingEntry?.staffId ?? 'new'}`} />
            </label>
            {/* Cafe v2.1 does not use employment type in permissions, scheduling, or estimates.
                Preserve an existing value during edits without exposing a redundant field. */}
            {editingEntry?.employmentType ? <input type="hidden" name="employmentType" value={editingEntry.employmentType} /> : null}
            <label style={{ maxWidth: 280 }}>
              {lang === 'ja' ? '時給（円・概算用）' : 'Hourly wage (JPY, estimate)'}
              <div style={{ position: 'relative' }}>
              <span aria-hidden style={{ position: 'absolute', left: 12, top: 14, fontWeight: 700, color: demoColors.textMuted }}>¥</span>
              <input
                style={{ ...inputStyle, paddingLeft: 30, fontVariantNumeric: 'tabular-nums' }}
                name="hourlyWageYen"
                type="number"
                min={0}
                max={1000000}
                step={1}
                defaultValue={editingEntry?.hourlyWageYen ?? ''}
                key={`wage-${editingEntry?.staffId ?? 'new'}`}
              />
              </div>
            </label>
            <label>{lang === 'ja' ? 'メールアドレス' : 'Email address'}<input style={inputStyle} name="email" type="email" defaultValue={editingEntry?.email ?? ''} required maxLength={254} autoComplete="off" /></label>
            <label>
              LINE User ID {editingEntry ? <span style={{ ...mutedText, fontSize: 11 }}>({lang === 'ja' ? '変更する場合のみ入力' : 'enter only to replace'})</span> : null}
              <input style={inputStyle} name="rawLineUserId" required={!editingEntry} maxLength={128} autoComplete="off" />
            </label>
            <label>{lang === 'ja' ? 'メモ' : 'Notes'}<textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} name="notes" defaultValue={editingEntry?.notes ?? ''} maxLength={1000} /></label>
            <label>{lang === 'ja' ? 'ステータス' : 'Status'}
              <select style={inputStyle} name="isActive" defaultValue={editingEntry?.isActive === false ? 'false' : 'true'}>
                <option value="true">{t('active')}</option><option value="false">{t('inactive')}</option>
              </select>
            </label>
            {feedback ? <p style={{ margin: 0, color: feedback.ok ? undefined : demoColors.dangerText }}>{feedback.text}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={buttonSecondary} onClick={() => setMode('list')} disabled={isPending}>
                {t('cancel')}
              </button>
              <button type="submit" style={buttonPrimary} disabled={isPending}>
                {t('save')}
              </button>
            </div>
          </form>
        </>
      )}
      <ConfirmDialog
        open={permanentDeleteTarget !== null}
        title={t('confirmPermanentDeleteStaffTitle')}
        confirmLabel={t('confirmPermanentDeleteStaffButton')}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setPermanentDeleteTarget(null)}
        onConfirm={() => {
          if (permanentDeleteTarget) handlePermanentDelete(permanentDeleteTarget.staffId);
        }}
      >
        {t('confirmPermanentDeleteStaffBody')}
        {permanentDeleteError ? (
          <span style={{ display: 'block', marginTop: 10, color: demoColors.dangerText, fontSize: 12 }}>{permanentDeleteError}</span>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

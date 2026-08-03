'use client';

import { useState, useTransition } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { previewGetStaffManagerData, previewSetEmployeeActive, previewUpsertEmployee } from './actions/staff-actions';
import { previewWriteMessage, type PreviewWriteResult } from './write-result';
import { badgeStyle, buttonPrimary, buttonSecondary, demoColors, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';
import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';

/**
 * Phase 1N-4C Slice B2a - preview-specific manager client island for
 * employee create/edit and activate/deactivate. Calls only
 * `previewUpsertEmployee`/`previewSetEmployeeActive` (never the dashboard
 * `staff-actions.ts`). No tenant/location/role/permission field is ever
 * submitted - `id`/`staffId` are the only client-supplied identifiers, and
 * both are legitimate target-record ids re-verified server-side.
 */
export interface PreviewStaffFormProps {
  staff: WorkforceStaffManageEntry[] | null;
  /**
   * Called with the freshly-refetched roster after a successful save/
   * deactivate (via `previewGetStaffManagerData()`, never `router.refresh()`)
   * so an Inventory/Recipes/Schedule re-render never happens as a side
   * effect. Owned by `PreviewStaffRecipeManagement` (the parent that stays
   * mounted across this form's own dialog open/close cycles) rather than by
   * this component itself, since the shared `Modal` unmounts its children on
   * close -- state owned here would be silently discarded on every close,
   * reverting to the stale initial-load `staff` prop on next open. Preview
   * Manager architecture, perf phase 2.
   */
  onStaffChanged: (next: WorkforceStaffManageEntry[]) => void;
}

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
  const [deleteTarget, setDeleteTarget] = useState<WorkforceStaffManageEntry | null>(null);

  const editingEntry = editingId ? (staff ?? []).find((s) => s.staffId === editingId) ?? null : null;

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

  function handleSetActive(staffId: string, nextActive: boolean) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('staffId', staffId);
      formData.set('isActive', nextActive ? 'true' : 'false');
      const result = await previewSetEmployeeActive(formData);
      setFeedback(toFeedback(lang, result));
      if (result.status === 'success') await refreshStaff();
    });
  }

  return (
    <div>
      {mode === 'list' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
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
          {staff === null ? (
            <p style={mutedText}>{t('staffListErrorShort')}</p>
          ) : staff.length === 0 ? (
            <p style={mutedText}>{t('staffListEmptyShort')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {staff.map((s) => (
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
                    {s.isActive ? (
                      <button type="button" style={{ ...buttonSecondary, color: demoColors.dangerText }} onClick={() => setDeleteTarget(s)} disabled={isPending}>
                        {lang === 'ja' ? '無効化' : 'Deactivate'}
                      </button>
                    ) : (
                      <button type="button" style={buttonSecondary} onClick={() => handleSetActive(s.staffId, true)} disabled={isPending}>{t('reactivate')}</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>{mode === 'edit' ? t('editStaffTitle') : t('addStaffTitle')}</h3>
          <form action={handleUpsert} style={{ display: 'grid', gap: 12 }}>
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
        open={deleteTarget !== null}
        title={lang === 'ja' ? 'スタッフを無効化しますか？' : 'Deactivate this staff member?'}
        confirmLabel={lang === 'ja' ? '無効化する' : 'Deactivate staff'}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          handleSetActive(deleteTarget.staffId, false);
          setDeleteTarget(null);
        }}
      >
        {lang === 'ja' ? '勤務履歴とレポートは保持したまま、アクティブなスタッフから外します。必要なら後で復元できます。' : 'They will be removed from active staff while shifts and reports are retained. You can restore them later.'}
      </ConfirmDialog>
    </div>
  );
}

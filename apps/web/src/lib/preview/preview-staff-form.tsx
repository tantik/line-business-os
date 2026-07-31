'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { previewSetEmployeeActive, previewUpsertEmployee } from './actions/staff-actions';
import { previewWriteMessage, type PreviewWriteResult } from './write-result';
import { badgeStyle, buttonPrimary, buttonSecondary, demoColors, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

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
}

function toFeedback(lang: Lang, result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: tManager(lang, 'saved') };
  return { ok: false, text: previewWriteMessage(lang, result.status) };
}

export function PreviewStaffForm({ staff }: PreviewStaffFormProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const editingEntry = editingId ? (staff ?? []).find((s) => s.staffId === editingId) ?? null : null;

  function handleUpsert(formData: FormData) {
    startTransition(async () => {
      const result = await previewUpsertEmployee(formData);
      setFeedback(toFeedback(lang, result));
      if (result.status === 'success') {
        setEditingId(null);
        setMode('list');
        router.refresh();
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
      if (result.status === 'success') router.refresh();
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
                      {s.positionLabel || t('roleFallback')} ・ {s.employmentType || t('employmentTypeUnset')} ・{' '}
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
                    <button type="button" style={buttonSecondary} onClick={() => handleSetActive(s.staffId, !s.isActive)} disabled={isPending}>
                      {s.isActive ? t('deactivate') : t('reactivate')}
                    </button>
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
            <label>
              {t('displayName')}
              <input style={inputStyle} name="name" defaultValue={editingEntry?.name ?? ''} required maxLength={120} key={editingEntry?.staffId ?? 'new'} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label>
                {t('position')}
                <input style={inputStyle} name="positionLabel" defaultValue={editingEntry?.positionLabel ?? ''} maxLength={60} key={`pos-${editingEntry?.staffId ?? 'new'}`} />
              </label>
              <label>
                {t('employmentType')}
                <input style={inputStyle} name="employmentType" defaultValue={editingEntry?.employmentType ?? ''} maxLength={40} key={`emp-${editingEntry?.staffId ?? 'new'}`} />
              </label>
            </div>
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
    </div>
  );
}

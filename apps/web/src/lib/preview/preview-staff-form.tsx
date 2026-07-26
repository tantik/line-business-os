'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { previewSetEmployeeActive, previewUpsertEmployee } from './actions/staff-actions';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { badgeStyle, buttonPrimary, buttonSecondary, card, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';

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

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '保存しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

export function PreviewStaffForm({ staff }: PreviewStaffFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const editingEntry = editingId ? (staff ?? []).find((s) => s.staffId === editingId) ?? null : null;

  function handleUpsert(formData: FormData) {
    startTransition(async () => {
      const result = await previewUpsertEmployee(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') {
        setEditingId(null);
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
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>スタッフの追加・編集</h2>

      <form action={handleUpsert} style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 420 }}>
        {editingEntry ? <input type="hidden" name="id" value={editingEntry.staffId} /> : null}
        <label>
          氏名
          <input style={inputStyle} name="name" defaultValue={editingEntry?.name ?? ''} required maxLength={120} key={editingEntry?.staffId ?? 'new'} />
        </label>
        <label>
          役職
          <input style={inputStyle} name="positionLabel" defaultValue={editingEntry?.positionLabel ?? ''} maxLength={60} key={`pos-${editingEntry?.staffId ?? 'new'}`} />
        </label>
        <label>
          雇用形態
          <input
            style={inputStyle}
            name="employmentType"
            defaultValue={editingEntry?.employmentType ?? ''}
            maxLength={40}
            key={`emp-${editingEntry?.staffId ?? 'new'}`}
          />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={buttonPrimary} disabled={isPending}>
            {editingEntry ? '更新する' : '追加する'}
          </button>
          {editingEntry ? (
            <button type="button" style={buttonSecondary} onClick={() => setEditingId(null)} disabled={isPending}>
              キャンセル
            </button>
          ) : null}
        </div>
      </form>

      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}

      {staff === null ? (
        <p style={{ marginTop: 12, ...mutedText }}>スタッフ一覧を読み込めませんでした。</p>
      ) : staff.length === 0 ? (
        <p style={{ marginTop: 12, ...mutedText }}>スタッフがまだ登録されていません。</p>
      ) : (
        <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>氏名</th>
              <th style={{ textAlign: 'left' }}>状態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.staffId}>
                <td style={{ padding: '6px 0' }}>{s.name}</td>
                <td style={{ padding: '6px 0' }}>
                  <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? '在籍中' : '休止中'}</span>
                </td>
                <td style={{ padding: '6px 0', display: 'flex', gap: 8 }}>
                  <button type="button" style={buttonSecondary} onClick={() => setEditingId(s.staffId)} disabled={isPending}>
                    編集
                  </button>
                  <button
                    type="button"
                    style={buttonSecondary}
                    onClick={() => handleSetActive(s.staffId, !s.isActive)}
                    disabled={isPending}
                  >
                    {s.isActive ? '休止にする' : '再開する'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

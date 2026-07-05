'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { STAFF } from '@/lib/demo/cafe/data';
import { buttonPrimary, buttonSecondary, demoColors, input } from '@/lib/demo/cafe/theme';

interface StaffManagementModalProps {
  open: boolean;
  onClose: () => void;
}

interface ManagedStaff {
  id: string;
  familyName: string;
  givenName: string;
  displayName: string;
  hourlyWageYen: number;
  lineUserId: string;
  status: 'active' | 'paused';
  memo: string;
}

type StaffForm = Omit<ManagedStaff, 'id'>;
type ViewMode = 'list' | 'add' | 'edit';

const emptyForm: StaffForm = {
  familyName: '',
  givenName: '',
  displayName: '',
  hourlyWageYen: 1050,
  lineUserId: '',
  status: 'active',
  memo: '',
};
const fieldLabel = { fontSize: 12, color: demoColors.textMuted };

function seedStaff(): ManagedStaff[] {
  return STAFF.map((staff) => {
    const [familyName, givenName] = staff.name.split(' ');
    return {
      id: staff.id,
      familyName: familyName ?? staff.name,
      givenName: givenName ?? '',
      displayName: staff.name,
      hourlyWageYen: staff.hourlyWageYen,
      lineUserId: `Udemo${staff.id}0000000000000000000000000000`,
      status: 'active',
      memo: '',
    };
  });
}

function rowActionButtonStyle(danger: boolean) {
  return {
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    cursor: 'pointer',
    border: `1px solid ${danger ? demoColors.dangerText : demoColors.border}`,
    background: demoColors.surface,
    color: danger ? demoColors.dangerText : demoColors.textPrimary,
  } as const;
}

/** スタッフ管理: demo-only mock staff roster (add/edit/delete kept in local component state, no backend, does not affect the shift table). Add/edit swaps the modal into a dedicated form view instead of an inline block. */
export function StaffManagementModal({ open, onClose }: StaffManagementModalProps) {
  const [staffList, setStaffList] = useState<ManagedStaff[]>(seedStaff);
  const [mode, setMode] = useState<ViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);

  useEffect(() => {
    if (open) setMode('list');
  }, [open]);

  function startEdit(staff: ManagedStaff) {
    setEditingId(staff.id);
    setForm({
      familyName: staff.familyName,
      givenName: staff.givenName,
      displayName: staff.displayName,
      hourlyWageYen: staff.hourlyWageYen,
      lineUserId: staff.lineUserId,
      status: staff.status,
      memo: staff.memo,
    });
    setMode('edit');
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setMode('add');
  }

  function handleSave() {
    if (mode === 'edit' && editingId) {
      setStaffList((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...form } : s)));
    } else {
      setStaffList((prev) => [...prev, { id: `demo-staff-${Date.now()}`, ...form }]);
    }
    setMode('list');
  }

  function removeStaff(id: string) {
    setStaffList((prev) => prev.filter((s) => s.id !== id));
  }

  const title = mode === 'list' ? 'スタッフ管理' : mode === 'add' ? 'スタッフを追加' : 'スタッフを編集';

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={mode === 'list' ? 720 : 480}>
      {mode === 'list' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: demoColors.textMuted }}>
              デモ用のスタッフ一覧です。追加・編集・削除はこの画面内のみで有効です。
            </p>
            <button type="button" style={{ ...buttonPrimary, padding: '8px 14px', fontSize: 13, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={startAdd}>
              スタッフを追加
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {staffList.map((staff) => (
              <div
                key={staff.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: demoColors.surfaceElevated,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: demoColors.textPrimary }}>{staff.displayName}</div>
                  <div style={{ fontSize: 11.5, color: demoColors.textMuted, marginTop: 2 }}>
                    {staff.familyName} {staff.givenName} ・ 時給 ¥{staff.hourlyWageYen.toLocaleString('ja-JP')} ・{' '}
                    {staff.status === 'active' ? 'Active' : 'Paused'}
                  </div>
                  <div style={{ fontSize: 11, color: demoColors.textMuted, marginTop: 2 }}>LINE User ID: {staff.lineUserId}</div>
                  {staff.memo ? (
                    <div style={{ fontSize: 11, color: demoColors.textMuted, marginTop: 3 }}>{staff.memo}</div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" onClick={() => startEdit(staff)} style={rowActionButtonStyle(false)}>
                    編集
                  </button>
                  <button type="button" onClick={() => removeStaff(staff.id)} style={rowActionButtonStyle(true)}>
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={fieldLabel}>Family name</label>
              <input value={form.familyName} onChange={(e) => setForm((f) => ({ ...f, familyName: e.target.value }))} style={input} />
            </div>
            <div>
              <label style={fieldLabel}>Given name</label>
              <input value={form.givenName} onChange={(e) => setForm((f) => ({ ...f, givenName: e.target.value }))} style={input} />
            </div>
          </div>
          <div>
            <label style={fieldLabel}>Display name</label>
            <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} style={input} />
          </div>
          <div>
            <label style={fieldLabel}>時給（円）</label>
            <input
              type="number"
              min={0}
              step={10}
              value={form.hourlyWageYen}
              onChange={(e) => setForm((f) => ({ ...f, hourlyWageYen: Number(e.target.value) }))}
              style={input}
            />
          </div>
          <div>
            <label style={fieldLabel}>LINE User ID</label>
            <input value={form.lineUserId} onChange={(e) => setForm((f) => ({ ...f, lineUserId: e.target.value }))} style={input} />
          </div>
          <div>
            <label style={fieldLabel}>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'paused' }))}
              style={input}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div>
            <label style={fieldLabel}>メモ</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              rows={3}
              placeholder="例: 週末のみ勤務可能"
              style={{ ...input, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" style={buttonSecondary} onClick={() => setMode('list')}>
              キャンセル
            </button>
            <button type="button" style={buttonPrimary} onClick={handleSave}>
              保存
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

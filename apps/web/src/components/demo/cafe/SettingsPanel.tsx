'use client';

import { useState } from 'react';
import { WEEKDAY_LABELS_MON_FIRST } from '@/lib/demo/cafe/format';
import { buttonPrimary, demoColors, input, shiftChipColors, shiftChipStyle, shiftTypeDisplayLabel } from '@/lib/demo/cafe/theme';
import type { ShiftAssignment, ShiftTypeDef, StaffingRequirement } from '@/lib/demo/cafe/types';

interface SettingsPanelProps {
  requirements: StaffingRequirement[];
  onChangeRequirement: (weekday: number, value: number) => void;
  maxMonthlyHours: number;
  onChangeMaxMonthlyHours: (value: number) => void;
  shiftTypes: ShiftTypeDef[];
  assignments: ShiftAssignment[];
  onAddShiftType: (type: ShiftTypeDef) => void;
  onEditShiftType: (id: string, changes: Pick<ShiftTypeDef, 'label' | 'startTime' | 'endTime'>) => void;
  onDeleteShiftType: (id: string) => void;
}

const smallButton = {
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  cursor: 'pointer',
} as const;

export function SettingsPanel({
  requirements,
  onChangeRequirement,
  maxMonthlyHours,
  onChangeMaxMonthlyHours,
  shiftTypes,
  assignments,
  onAddShiftType,
  onEditShiftType,
  onDeleteShiftType,
}: SettingsPanelProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState('10:00');
  const [newEnd, setNewEnd] = useState('14:00');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  function handleAddShiftType() {
    if (!newStart || !newEnd) return;
    onAddShiftType({
      id: `custom-${Date.now()}`,
      label: newLabel.trim() || `${newStart}-${newEnd}`,
      startTime: newStart,
      endTime: newEnd,
      isCustom: true,
    });
    setNewLabel('');
  }

  function startEdit(type: ShiftTypeDef) {
    setEditingId(type.id);
    setEditLabel(type.label);
    setEditStart(type.startTime ?? '');
    setEditEnd(type.endTime ?? '');
  }

  function saveEdit() {
    if (!editingId) return;
    onEditShiftType(editingId, { label: editLabel.trim() || editingId, startTime: editStart, endTime: editEnd });
    setEditingId(null);
  }

  function isShiftTypeInUse(id: string): boolean {
    return assignments.some((assignment) => assignment.shiftTypeId === id);
  }

  return (
    <section
      style={{
        border: `1px solid ${demoColors.border}`,
        borderRadius: 8,
        padding: 20,
        background: demoColors.surface,
        boxShadow: '0 1px 2px rgba(54, 43, 31, 0.04), 0 10px 24px rgba(54, 43, 31, 0.05)',
        display: 'grid',
        gap: 22,
      }}
    >
      <strong style={{ fontSize: 15 }}>設定</strong>

      <div>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>必要人数（曜日ごと）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {WEEKDAY_LABELS_MON_FIRST.map((label, weekday) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: demoColors.textMuted, marginBottom: 4 }}>{label}</div>
              <input
                type="number"
                min={0}
                value={requirements[weekday]?.requiredCount ?? 0}
                onChange={(event) => onChangeRequirement(weekday, Number(event.target.value))}
                style={{ ...input, textAlign: 'center', padding: '6px 4px' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 13, color: demoColors.textMuted }}>スタッフ最大勤務時間 / 月</label>
        <input
          type="number"
          min={0}
          value={maxMonthlyHours}
          onChange={(event) => onChangeMaxMonthlyHours(Number(event.target.value))}
          style={{ ...input, maxWidth: 140 }}
        />
      </div>

      <div>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>シフト種別</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {shiftTypes.map((type) => {
            const chip = shiftChipColors(type.id);
            const inUse = isShiftTypeInUse(type.id);

            if (editingId === type.id) {
              return (
                <div
                  key={type.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'flex-end',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: demoColors.surfaceElevated,
                  }}
                >
                  <div>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>名称</label>
                    <input value={editLabel} onChange={(event) => setEditLabel(event.target.value)} style={{ ...input, width: 110 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>開始</label>
                    <input type="time" value={editStart} onChange={(event) => setEditStart(event.target.value)} style={{ ...input, width: 100 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: demoColors.textMuted }}>終了</label>
                    <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.target.value)} style={{ ...input, width: 100 }} />
                  </div>
                  <button type="button" onClick={saveEdit} style={{ ...smallButton, border: 'none', background: demoColors.accent, color: '#FFFFFF' }}>
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    style={{ ...smallButton, border: `1px solid ${demoColors.border}`, background: demoColors.surface, color: demoColors.textPrimary }}
                  >
                    キャンセル
                  </button>
                </div>
              );
            }

            return (
              <div
                key={type.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: demoColors.surfaceElevated,
                }}
              >
                <span style={shiftChipStyle(chip.background, chip.color)}>{shiftTypeDisplayLabel(type)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => startEdit(type)}
                    style={{ ...smallButton, border: `1px solid ${demoColors.border}`, background: demoColors.surface, color: demoColors.textPrimary }}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    disabled={inUse}
                    title={inUse ? '使用中のシフト種別は削除できません（デモ）' : undefined}
                    onClick={() => onDeleteShiftType(type.id)}
                    style={{
                      ...smallButton,
                      border: `1px solid ${inUse ? demoColors.border : demoColors.dangerText}`,
                      background: demoColors.surface,
                      color: inUse ? demoColors.textMuted : demoColors.dangerText,
                      cursor: inUse ? 'not-allowed' : 'pointer',
                      opacity: inUse ? 0.6 : 1,
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 12, color: demoColors.textMuted }}>名称（任意）</label>
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} style={{ ...input, width: 120 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: demoColors.textMuted }}>開始</label>
            <input type="time" value={newStart} onChange={(event) => setNewStart(event.target.value)} style={{ ...input, width: 110 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: demoColors.textMuted }}>終了</label>
            <input type="time" value={newEnd} onChange={(event) => setNewEnd(event.target.value)} style={{ ...input, width: 110 }} />
          </div>
          <button type="button" style={buttonPrimary} onClick={handleAddShiftType}>
            シフト種別を追加
          </button>
        </div>
      </div>
    </section>
  );
}

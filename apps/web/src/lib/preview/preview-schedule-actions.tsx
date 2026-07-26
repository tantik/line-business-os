'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { previewPublishSchedule, previewRunAutoDistribution } from './actions/schedule-actions';
import { buildStaffingRequirements, hasPositiveHeadcount, type StaffingRequirementRowInput } from './auto-distribution-requirements';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { buttonPrimary, buttonSecondary, card, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';

/**
 * Phase 1N-4C Slice B2a - preview-specific manager client island for
 * auto-distribution and schedule publish. Calls only
 * `previewRunAutoDistribution`/`previewPublishSchedule` (never the dashboard
 * `schedule-actions.ts`). No tenant/location field is ever submitted - both
 * actions substitute the server-resolved active location unconditionally.
 *
 * Post-review fix: the auto-distribution algorithm (`autoDistribute()`) only
 * ever creates a windowed-shift-type draft assignment when a staffing
 * requirement's headcount exceeds what's already filled - an empty
 * `staffingRequirements` array (or one where every row is `requiredHeadcount:
 * 0`) defaults every window's required headcount to 0, so every submitted
 * preference is reported unplaced and the button was a silent no-op
 * (confirmed empirically during review). This island requires the manager to
 * specify at least one row with a positive headcount before it will call
 * `previewRunAutoDistribution` at all - a zero-headcount row stays valid
 * alongside a positive one (it legitimately means "no one needed here"), but
 * no hidden default requirement is ever invented on the manager's behalf.
 */
export interface PreviewScheduleActionsProps {
  periodStart: string;
  periodEnd: string;
}

const WINDOW_CODE_OPTIONS = ['ALL', 'AM', 'PM', 'A-P', 'SHORT_AM'] as const;

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '実行しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

function emptyRow(defaultWorkDate: string): StaffingRequirementRowInput {
  return { workDate: defaultWorkDate, windowCode: '', requiredHeadcount: '' };
}

export function PreviewScheduleActions({ periodStart, periodEnd }: PreviewScheduleActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [rows, setRows] = useState<StaffingRequirementRowInput[]>([emptyRow(periodStart)]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function updateRow(index: number, patch: Partial<StaffingRequirementRowInput>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow(periodStart)]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function handleAutoDistribute() {
    const staffingRequirements = buildStaffingRequirements(rows);
    // A requirement row with requiredHeadcount: 0 is valid on its own (it
    // expresses "no one is needed for this window"), but a set where every
    // row is zero - like an empty set - can never produce a draft
    // assignment for any windowed shift type. Never call the Server Action
    // for either case; never invent a default headcount to make one up.
    if (!hasPositiveHeadcount(staffingRequirements)) {
      setFeedback({ ok: false, text: previewWriteMessageJa('invalid_input') });
      return;
    }
    startTransition(async () => {
      const result = await previewRunAutoDistribution({
        periodStart,
        periodEnd,
        staffingRequirements,
        overwriteExisting,
      });
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('periodStart', periodStart);
      formData.set('periodEnd', periodEnd);
      const result = await previewPublishSchedule(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>
        自動割り当て・公開 ({periodStart} - {periodEnd})
      </h2>

      <p style={{ marginTop: 8, ...mutedText, fontSize: 12 }}>
        自動割り当てには、必要な人数を少なくとも1件指定してください（日付・時間帯・必要人数）。指定がない時間帯にはスタッフは割り当てられません。
      </p>

      {rows.map((row, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <input
            style={{ ...inputStyle, width: 160 }}
            type="date"
            min={periodStart}
            max={periodEnd}
            value={row.workDate}
            onChange={(e) => updateRow(index, { workDate: e.currentTarget.value })}
          />
          <select style={{ ...inputStyle, width: 140 }} value={row.windowCode} onChange={(e) => updateRow(index, { windowCode: e.currentTarget.value })}>
            <option value="">時間帯を選択</option>
            {WINDOW_CODE_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <input
            style={{ ...inputStyle, width: 100 }}
            type="number"
            min={0}
            max={100}
            placeholder="必要人数"
            value={row.requiredHeadcount}
            onChange={(e) => updateRow(index, { requiredHeadcount: e.currentTarget.value })}
          />
          <button type="button" style={buttonSecondary} onClick={() => removeRow(index)} disabled={isPending || rows.length === 1}>
            削除
          </button>
        </div>
      ))}
      <button type="button" style={{ ...buttonSecondary, marginTop: 8 }} onClick={addRow} disabled={isPending}>
        行を追加
      </button>

      <label style={{ display: 'block', marginTop: 12 }}>
        <input type="checkbox" checked={overwriteExisting} onChange={(e) => setOverwriteExisting(e.currentTarget.checked)} /> 既存の下書きシフトを上書きする
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" style={buttonSecondary} onClick={handleAutoDistribute} disabled={isPending}>
          自動割り当てを実行
        </button>
        <button type="button" style={buttonPrimary} onClick={handlePublish} disabled={isPending}>
          今週のシフトを公開
        </button>
      </div>
      <p style={{ marginTop: 8, ...mutedText, fontSize: 12 }}>
        スタッフの提出済み希望シフトをもとに、指定した人数の範囲で自動で割り当てます。公開すると下書きが確定シフトになります。
      </p>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}

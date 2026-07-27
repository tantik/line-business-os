import type { ReactNode } from 'react';
import Link from 'next/link';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { addIsoDays } from '@/lib/workforce/timezone';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_MONTHLY_REPORT, HELP_MANAGER_SHIFT_TABLE } from '@/lib/demo/cafe/helpContent';
import { formatMonthDay } from '@/lib/demo/cafe/format';
import { buttonDisabled, buttonSecondary, card, demoColors, mutedText, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import { toManagerViewAssignments, toManagerViewShiftTypes, toManagerViewStaff } from './manager-view-model';

/**
 * Phase 1N-4C Slice B1 - action-free, read-only manager display for the Mame
 * To Cha preview. Deliberately NOT `'use client'` and imports nothing from
 * `staff-actions.ts`/`schedule-actions.ts`/`attendance-actions.ts` and no
 * mutation-form component (`StaffForm`/`LineLinkForm`/`ShiftCellEditor`) - a
 * plain server component has no client bundle at all, so there is no
 * `next build` client-reference-manifest entry for this file to register a
 * Server Action against, structurally (not just visually) closing the gap
 * found in the prior read-only-prop approach (verified via
 * `.next/server/server-reference-manifest.json` inspection - see
 * `scripts/verify-preview-no-server-actions.mjs`).
 *
 * Cafe manager UI unification (fix/cafe-v2-manager-parity): renders exactly
 * the single シフト表 card - week nav, `ShiftTable`, shift-type legend chips -
 * that the demo's `ManagerView` also renders as its main card. Staff list,
 * shift-type editing, submitted preferences, and correction requests all
 * moved into dialogs (`PreviewStaffRecipeManagement`,
 * `PreviewCorrectionRequestsPanel`, the shift-editor dialog inside
 * `PreviewScheduleCardActions`) rendered by the page alongside this
 * component, not duplicated inline here - see
 * `_client-preview/mame-to-cha/manager/page.tsx`. `actionsSlot` lets the
 * page inject those dialog-trigger buttons (a Client Component) into this
 * card's header without this file itself becoming a client component or
 * importing any preview Server Action.
 * `ShiftTable` is rendered here with no `onCellClick` - its own
 * `isCellClickable()` then always returns false, so the grid is read-only
 * with no behavior change, not a second reimplementation of "read-only mode".
 */
export interface PreviewManagerViewProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  staff: WorkforceStaffManageEntry[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  /** Public preview route base, e.g. `/mame-to-cha` - used for week-navigation links only. */
  basePath: string;
  /** Dialog-trigger buttons (auto-distribute/publish, shift add/edit) rendered by the page - a Client Component, passed down as an already-resolved node. */
  actionsSlot?: ReactNode;
}

function weekDates(periodStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addIsoDays(periodStart, i));
}

export function PreviewManagerView({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  staff,
  shiftTypes,
  assignments,
  basePath,
  actionsSlot,
}: PreviewManagerViewProps) {
  const dates = weekDates(periodStart);
  const todayIso = todayIsoInTimeZone(timeZone);

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 16 }}>シフト表</strong>
          <DemoHelpButton content={HELP_MANAGER_SHIFT_TABLE} />
        </div>
        {actionsSlot}
      </div>

      <p style={{ margin: '8px 0 4px', fontSize: 12.5, ...mutedText }}>
        セルをクリックして手動でシフトを編集できます。列見出しの「!」は必要人数に対して人員が不足している日を示します。
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: demoColors.textPrimary }}>
          {formatMonthDay(new Date(`${periodStart}T00:00:00`))} 〜 {formatMonthDay(new Date(`${periodEnd}T00:00:00`))}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`${basePath}/manager?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
            ← 前の週
          </Link>
          <Link
            href={`${basePath}/manager`}
            style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
            aria-disabled={weekOffset === 0}
          >
            今日
          </Link>
          <Link href={`${basePath}/manager?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
            次の週 →
          </Link>
        </div>
      </div>

      {staff === null ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>スタッフ一覧を読み込めませんでした。</p>
      ) : staff.length === 0 ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>スタッフを追加すると週間シフト表が表示されます。</p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <ShiftTable
            dates={dates}
            todayIso={todayIso}
            staffList={toManagerViewStaff(staff)}
            assignments={assignments === null ? [] : toManagerViewAssignments(assignments, timeZone)}
            shiftTypes={shiftTypes === null ? [] : toManagerViewShiftTypes(shiftTypes)}
            mode="manager"
          />
        </div>
      )}

      {shiftTypes !== null && shiftTypes.length > 0 ? (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
          {toManagerViewShiftTypes(shiftTypes).map((type) => {
            const chip = shiftChipColors(type.id);
            return (
              <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={shiftChipStyle(chip.background, chip.color, true)}>{type.label}</span>
                <span style={{ fontSize: 11, color: demoColors.textMuted }}>
                  {type.startTime}-{type.endTime}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
        <button type="button" style={buttonSecondary} disabled title="月間レポートは次のリリースで有効になります">
          月間レポートCSV
        </button>
        <DemoHelpButton content={HELP_MANAGER_MONTHLY_REPORT} />
      </div>
    </section>
  );
}

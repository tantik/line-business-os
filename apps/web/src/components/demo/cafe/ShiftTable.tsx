'use client';

import { memo } from 'react';
import type { ShiftAssignment, ShiftTypeDef, StaffMember, WorkReport } from '@/lib/demo/cafe/types';
import { formatMonthDay, weekdayLabel } from '@/lib/demo/cafe/format';
import { demoColors, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { reportNeedsManagerAttention } from '@/lib/demo/cafe/report-indicator';

interface ShiftTableProps {
  dates: string[];
  todayIso: string;
  /** Only `id`/`name`/`role` are actually read — narrowed (rather than the full `StaffMember`) so a non-demo caller with real staff records (no wage/transport/preference fields) can pass its own staff shape directly. */
  staffList: Pick<StaffMember, 'id' | 'name' | 'role'>[];
  assignments: ShiftAssignment[];
  shiftTypes: ShiftTypeDef[];
  mode: 'staff' | 'manager';
  currentStaffId?: string;
  onlyCurrentStaff?: boolean;
  workReports?: WorkReport[];
  shortageDateSet?: Set<string>;
  onCellClick?: (staffId: string, date: string) => void;
  onStaffClick?: (staffId: string) => void;
  /** Compact sizing so a full 7-day week fits an iPhone-width screen with no inner horizontal scroll. Staff screen only — manager table keeps its normal desktop sizing. */
  compact?: boolean;
  /** Shared with staff and manager. Only the staff screen ever passes 'en' — the manager dashboard stays Japanese-first, so this defaults to 'ja' and this component never reads `useLang()` itself (it is rendered from both a lang-aware and a lang-unaware parent). */
  lang?: Lang;
  selectedCell?: { staffId: string; date: string } | null;
  attentionCellKeys?: Set<string>;
}

const CHROME_LABELS: Record<Lang, { staffColumn: string; managerRole: string; shortageTooltip: string; correctionTooltip: string; messageTooltip: string }> = {
  ja: { staffColumn: 'スタッフ', managerRole: '店長', shortageTooltip: '人手不足の可能性があります', correctionTooltip: '修正依頼あり', messageTooltip: 'メッセージあり' },
  en: { staffColumn: 'Staff', managerRole: 'Manager', shortageTooltip: 'Possible staffing shortage', correctionTooltip: 'Correction requested', messageTooltip: 'Message' },
};

/**
 * Shared shift grid for both the staff screen (read-mostly, self-row
 * highlight, own-past-cell click) and the manager screen (every cell
 * editable, with correction/shortage indicators).
 */
export const ShiftTable = memo(function ShiftTable({
  dates,
  todayIso,
  staffList,
  assignments,
  shiftTypes,
  mode,
  currentStaffId,
  onlyCurrentStaff = false,
  workReports = [],
  shortageDateSet,
  onCellClick,
  onStaffClick,
  compact = false,
  lang = 'ja',
  selectedCell = null,
  attentionCellKeys,
}: ShiftTableProps) {
  const labels = CHROME_LABELS[lang];
  const visibleStaff =
    mode === 'staff' && onlyCurrentStaff ? staffList.filter((staff) => staff.id === currentStaffId) : staffList;

  const assignmentMap = new Map<string, ShiftAssignment>();
  assignments.forEach((assignment) => assignmentMap.set(`${assignment.staffId}:${assignment.date}`, assignment));

  const reportMap = new Map<string, WorkReport>();
  workReports.forEach((report) => reportMap.set(`${report.staffId}:${report.date}`, report));

  const shiftTypeById = new Map(shiftTypes.map((type) => [type.id, type]));

  // Precomputed once per table render instead of once per staff x date cell --
  // `shiftChipColors` used to be called with a freshly-allocated
  // `shiftTypes.map(...)` id array (and filtered again internally) inside the
  // per-cell loop below, which visibly showed up as scroll/paint jank on
  // larger rosters.
  const allShiftTypeIds = shiftTypes.map((type) => type.id);
  const emptyChip = shiftChipColors(null);
  const chipByShiftTypeId = new Map(shiftTypes.map((type) => [type.id, shiftChipColors(type.id, allShiftTypeIds)]));
  // 1-based display-order index, used only in `compact` mode as a short
  // numeric badge instead of a shift type's full (often full-time-range)
  // `label` -- that label was overflowing/truncating on a ~375px mobile
  // cell (Founder Preview QA, 2026-08-25). Same ordering `ShiftLegend`'s own
  // `numbered` mode uses (both index the same `shiftTypes` array passed in
  // by the caller), so cell "3" and legend "[3]" always agree.
  const shiftTypeIndexById = new Map(shiftTypes.map((type, index) => [type.id, index + 1]));

  function isCellClickable(staffId: string, date: string): boolean {
    if (!onCellClick) return false;
    if (mode === 'manager') return true;
    if (staffId !== currentStaffId) return false;
    if (date < todayIso) return true;
    // Today's own cell only opens a report once one actually exists (e.g. after saving today's message) — otherwise there is nothing to show.
    if (date === todayIso) return reportMap.has(`${staffId}:${date}`);
    return assignmentMap.has(`${staffId}:${date}`);
  }

  const staffColWidth = compact ? '17%' : undefined;
  const staffColMinWidth = compact ? undefined : 92;
  const dayColWidth = compact ? `${(83 / dates.length).toFixed(2)}%` : undefined;
  const dayColMinWidth = compact ? undefined : 44;

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${demoColors.border}` }}>
      <table
        style={{
          borderCollapse: 'collapse',
          fontSize: compact ? 10.5 : 13,
          width: '100%',
          tableLayout: compact ? 'fixed' : 'auto',
          minWidth: compact ? undefined : dates.length * 46 + 92,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                position: compact ? 'static' : 'sticky',
                left: 0,
                zIndex: 2,
                background: demoColors.surfaceElevated,
                borderBottom: `1px solid ${demoColors.border}`,
                borderRight: `1px solid ${demoColors.columnDivider}`,
                padding: compact ? '4px 2px' : '10px 12px',
                textAlign: 'left',
                width: staffColWidth,
                minWidth: staffColMinWidth,
                color: demoColors.textMuted,
              }}
            >
              {labels.staffColumn}
            </th>
            {dates.map((date) => {
              const isToday = date === todayIso;
              const hasShortage = shortageDateSet?.has(date);
              const indicatorHeight = compact ? 12 : 14;
              return (
                <th
                  key={date}
                  title={hasShortage ? labels.shortageTooltip : undefined}
                  style={{
                    borderBottom: `1px solid ${demoColors.border}`,
                    borderRight: `1px solid ${demoColors.columnDivider}`,
                    padding: compact ? '4px 1px' : '10px 6px',
                    textAlign: 'center',
                    width: dayColWidth,
                    minWidth: dayColMinWidth,
                    background: isToday ? demoColors.todayBg : demoColors.surfaceElevated,
                    color: isToday ? demoColors.accentStrong : demoColors.textMuted,
                    fontWeight: isToday ? 700 : 500,
                  }}
                >
                  <div>{weekdayLabel(new Date(`${date}T00:00:00`), lang)}</div>
                  <div style={{ fontSize: compact ? 9.5 : 12 }}>{formatMonthDay(new Date(`${date}T00:00:00`))}</div>
                  {/* Fixed-height slot reserved on every header cell (not just shortage days) so the header height never shifts week to week. */}
                  <div
                    style={{
                      height: indicatorHeight,
                      lineHeight: `${indicatorHeight}px`,
                      color: demoColors.danger,
                      fontSize: compact ? 10 : 12,
                      fontWeight: 700,
                    }}
                  >
                    {hasShortage ? '!' : ' '}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visibleStaff.map((staff, rowIndex) => {
            const isSelfRow = staff.id === currentStaffId;
            const isZebraRow = !compact && !isSelfRow && rowIndex % 2 === 1;
            return (
              <tr
                key={staff.id}
                style={{ background: isSelfRow ? demoColors.selfRowBg : isZebraRow ? demoColors.zebraRowBg : 'transparent' }}
              >
                <td
                  style={{
                    position: compact ? 'static' : 'sticky',
                    left: 0,
                    zIndex: 1,
                    background: isSelfRow ? demoColors.selfRowSolidBg : isZebraRow ? demoColors.zebraRowBg : demoColors.surface,
                    borderBottom: `1px solid ${demoColors.border}`,
                    borderRight: `1px solid ${demoColors.columnDivider}`,
                    padding: compact ? '4px 2px' : '10px 12px',
                    fontWeight: isSelfRow ? 700 : 500,
                    color: isSelfRow ? demoColors.accentStrong : demoColors.textPrimary,
                    whiteSpace: 'nowrap',
                    overflow: compact ? 'hidden' : undefined,
                    textOverflow: compact ? 'ellipsis' : undefined,
                  }}
                >
                  {onStaffClick ? (
                    <button type="button" onClick={() => onStaffClick(staff.id)} style={{ border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted', cursor: 'pointer' }}>
                      {staff.name}
                    </button>
                  ) : staff.name}
                  {staff.role === 'manager' && !compact ? (
                    <span style={{ marginLeft: 6, fontSize: 11, color: demoColors.textMuted }}>{labels.managerRole}</span>
                  ) : null}
                </td>
                {dates.map((date) => {
                  const assignment = assignmentMap.get(`${staff.id}:${date}`);
                  const shiftType = shiftTypeById.get(assignment?.shiftTypeId ?? '');
                  // A custom shift (no shiftTypeId, or one that no longer resolves) still has a
                  // real time on the assignment itself -- show that instead of a blank dash,
                  // rather than silently dropping a shift that already counts toward scheduled
                  // hours (Cafe v2.1 QA audit P1-6, 2026-08-17).
                  const cellLabel = shiftType
                    ? compact
                      ? String(shiftTypeIndexById.get(shiftType.id) ?? shiftType.label)
                      : shiftType.label
                    : assignment?.startTime && assignment?.endTime
                      ? `${assignment.startTime}-${assignment.endTime}`
                      : '－';
                  const chip = assignment?.shiftTypeId ? chipByShiftTypeId.get(assignment.shiftTypeId) ?? emptyChip : emptyChip;
                  const isToday = date === todayIso;
                  const strongest = isToday && isSelfRow;
                  const report = reportMap.get(`${staff.id}:${date}`);
                  const clickable = isCellClickable(staff.id, date);
                  const showIndicator =
                    (reportNeedsManagerAttention(report) && (mode === 'manager' || isSelfRow)) ||
                    Boolean(attentionCellKeys?.has(`${staff.id}:${date}`));
                  const isSelected = selectedCell?.staffId === staff.id && selectedCell.date === date;
                  const isPastStaffCell = mode === 'staff' && date < todayIso;

                  const cellContent = <span style={shiftChipStyle(chip.background, chip.color, compact)}>{cellLabel}</span>;

                  return (
                    <td
                      key={date}
                      style={{
                        position: 'relative',
                        borderBottom: `1px solid ${demoColors.border}`,
                        borderRight: `1px solid ${demoColors.columnDivider}`,
                        padding: 0,
                        textAlign: 'center',
                        background: isSelected ? demoColors.alertWarningBg : strongest ? demoColors.selfTodayBg : isToday ? demoColors.todayBg : isPastStaffCell ? demoColors.surfaceElevated : 'transparent',
                        outline: isSelected ? `2px solid ${demoColors.accent}` : undefined,
                        outlineOffset: isSelected ? -2 : undefined,
                        opacity: isPastStaffCell ? 0.72 : 1,
                      }}
                    >
                      {clickable && mode === 'staff' ? (
                        // A real nested <button>, not `role="button"` on the <td> itself --
                        // overriding a table cell's implicit gridcell role breaks screen-reader
                        // table navigation (row/column announcements) for every clickable cell.
                        // Scoped to Staff mode only: Manager's grid is every cell in the table
                        // (`isCellClickable` returns true unconditionally for mode==='manager'),
                        // so making every cell a tab stop there would insert hundreds of new tab
                        // stops into an unrelated screen's tab order -- out of this Staff-only
                        // mission's scope and not reviewed for Manager (independent review,
                        // 2026-08-25). Manager's clickable cells keep their pre-existing
                        // mouse-only behavior below.
                        <button
                          type="button"
                          onClick={() => onCellClick?.(staff.id, date)}
                          style={{
                            display: 'block',
                            width: '100%',
                            border: 0,
                            margin: 0,
                            background: 'transparent',
                            font: 'inherit',
                            color: 'inherit',
                            textAlign: 'inherit',
                            padding: compact ? '4px 1px' : '10px 6px',
                            cursor: 'pointer',
                          }}
                        >
                          {cellContent}
                        </button>
                      ) : (
                        <div
                          onClick={clickable ? () => onCellClick?.(staff.id, date) : undefined}
                          style={{ padding: compact ? '4px 1px' : '10px 6px', cursor: clickable ? 'pointer' : 'default' }}
                        >
                          {cellContent}
                        </div>
                      )}
                      {showIndicator ? (
                        <span
                          title={report?.hasCorrectionRequest ? labels.correctionTooltip : labels.messageTooltip}
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            fontSize: 11,
                            fontWeight: 700,
                            color: report?.hasCorrectionRequest ? demoColors.danger : demoColors.warning,
                          }}
                        >
                          !
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

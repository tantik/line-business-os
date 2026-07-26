'use client';

import type { ShiftAssignment, ShiftTypeDef, StaffMember, WorkReport } from '@/lib/demo/cafe/types';
import { formatMonthDay, weekdayLabel } from '@/lib/demo/cafe/format';
import { demoColors, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import type { Lang } from '@/lib/demo/cafe/i18n';

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
  /** Compact sizing so a full 7-day week fits an iPhone-width screen with no inner horizontal scroll. Staff screen only — manager table keeps its normal desktop sizing. */
  compact?: boolean;
  /** Shared with staff and manager. Only the staff screen ever passes 'en' — the manager dashboard stays Japanese-first, so this defaults to 'ja' and this component never reads `useLang()` itself (it is rendered from both a lang-aware and a lang-unaware parent). */
  lang?: Lang;
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
export function ShiftTable({
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
  compact = false,
  lang = 'ja',
}: ShiftTableProps) {
  const labels = CHROME_LABELS[lang];
  const visibleStaff =
    mode === 'staff' && onlyCurrentStaff ? staffList.filter((staff) => staff.id === currentStaffId) : staffList;

  const assignmentMap = new Map<string, ShiftAssignment>();
  assignments.forEach((assignment) => assignmentMap.set(`${assignment.staffId}:${assignment.date}`, assignment));

  const reportMap = new Map<string, WorkReport>();
  workReports.forEach((report) => reportMap.set(`${report.staffId}:${report.date}`, report));

  const shiftTypeById = new Map(shiftTypes.map((type) => [type.id, type]));

  function isCellClickable(staffId: string, date: string): boolean {
    if (!onCellClick) return false;
    if (mode === 'manager') return true;
    if (staffId !== currentStaffId) return false;
    if (date < todayIso) return true;
    // Today's own cell only opens a report once one actually exists (e.g. after saving today's message) — otherwise there is nothing to show.
    return date === todayIso && reportMap.has(`${staffId}:${date}`);
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
                  <div>{weekdayLabel(new Date(`${date}T00:00:00`))}</div>
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
                  {staff.name}
                  {staff.role === 'manager' && !compact ? (
                    <span style={{ marginLeft: 6, fontSize: 11, color: demoColors.textMuted }}>{labels.managerRole}</span>
                  ) : null}
                </td>
                {dates.map((date) => {
                  const assignment = assignmentMap.get(`${staff.id}:${date}`);
                  const shiftType = shiftTypeById.get(assignment?.shiftTypeId ?? '');
                  const chip = shiftChipColors(assignment?.shiftTypeId ?? null);
                  const isToday = date === todayIso;
                  const strongest = isToday && isSelfRow;
                  const report = reportMap.get(`${staff.id}:${date}`);
                  const clickable = isCellClickable(staff.id, date);
                  const showIndicator =
                    (report?.hasCorrectionRequest || report?.message) && (mode === 'manager' || isSelfRow);

                  return (
                    <td
                      key={date}
                      onClick={clickable ? () => onCellClick?.(staff.id, date) : undefined}
                      style={{
                        position: 'relative',
                        borderBottom: `1px solid ${demoColors.border}`,
                        borderRight: `1px solid ${demoColors.columnDivider}`,
                        padding: compact ? '4px 1px' : '10px 6px',
                        textAlign: 'center',
                        background: strongest ? demoColors.selfTodayBg : isToday ? demoColors.todayBg : 'transparent',
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                    >
                      <span style={shiftChipStyle(chip.background, chip.color, compact)}>{shiftType?.label ?? '－'}</span>
                      {showIndicator ? (
                        <span
                          title={report!.hasCorrectionRequest ? labels.correctionTooltip : labels.messageTooltip}
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            fontSize: 11,
                            fontWeight: 700,
                            color: report!.hasCorrectionRequest ? demoColors.danger : demoColors.warning,
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
}

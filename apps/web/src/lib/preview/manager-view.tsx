import Link from 'next/link';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeLineLink } from '@/lib/workforce/employee-line-links';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import {
  badgeStyle,
  buttonDisabled,
  buttonSecondary,
  card,
  demoColors,
  mutedText,
  shiftChipColors,
  shiftChipStyle,
  tableCell,
  tableHeaderCell,
} from '@/lib/demo/cafe/theme';
import { toManagerViewAssignments, toManagerViewShiftTypes, toManagerViewStaff, UNKNOWN_STAFF_NAME_JA } from './manager-view-model';

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
 * Cafe manager UI unification: renders its section cards through the same
 * `ShiftTable`/`ShiftLegend` presentation components as `/demo/cafe/manager`
 * (via `manager-view-model.ts` adapters) and is itself rendered as a child of
 * the shared `CafeManagerScreen` shell (see
 * `_client-preview/mame-to-cha/manager/page.tsx`), which owns the page
 * background/container/header/要確認 block - so the DB-backed preview and the
 * polished demo share one visual system, not two glued-together shells.
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
  lineLinks: WorkforceEmployeeLineLink[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  requests: WorkforceShiftRequest[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  correctionRequests: WorkforceShiftRequest[] | null;
  attendance: WorkforceAttendance[] | null;
  /** Public preview route base, e.g. `/mame-to-cha` - used for week-navigation links only. */
  basePath: string;
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
  lineLinks,
  shiftTypes,
  requests,
  assignments,
  correctionRequests,
  attendance,
  basePath,
}: PreviewManagerViewProps) {
  const dates = weekDates(periodStart);
  const todayIso = todayIsoInTimeZone(timeZone);

  const shiftTypeById = new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st]));
  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const isLineLinkedByEmployeeId = new Map((lineLinks ?? []).filter((l) => l.isActive).map((l) => [l.employeeId, true]));
  const attendanceById = new Map((attendance ?? []).map((a) => [a.attendanceId, a]));

  const pendingCorrections = (correctionRequests ?? []).filter((r) => r.status === 'pending');
  const decidedCorrections = (correctionRequests ?? [])
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  return (
    <>
      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>スタッフ一覧</h2>
        {staff === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>スタッフ一覧を読み込めませんでした。</p>
        ) : staff.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>スタッフがまだ登録されていません。</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>氏名</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>役職</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>雇用形態</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>状態</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>LINE連携</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.staffId}>
                  <td style={tableCell}>{s.name}</td>
                  <td style={tableCell}>{s.positionLabel ?? '-'}</td>
                  <td style={tableCell}>{s.employmentType ?? '-'}</td>
                  <td style={tableCell}>
                    <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? '在籍中' : '休止中'}</span>
                  </td>
                  <td style={tableCell}>
                    <span style={badgeStyle(isLineLinkedByEmployeeId.get(s.staffId) ? 'active' : 'neutral')}>
                      {isLineLinkedByEmployeeId.get(s.staffId) ? '連携済み' : '未連携'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <strong style={{ fontSize: 16 }}>
            シフト表（{periodStart} 〜 {periodEnd}）
          </strong>
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

        <p style={{ margin: '16px 0 0', paddingTop: 16, borderTop: `1px solid ${demoColors.border}`, ...mutedText, fontSize: 12.5 }}>
          シフトの追加・変更・自動割り当ては、下部の「シフトの追加」「自動割り当て・公開」セクションから行えます。
        </p>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>シフト種別</h2>
        {shiftTypes === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>シフト種別を読み込めませんでした。</p>
        ) : shiftTypes.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>シフト種別がまだ設定されていません。</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>コード</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>名称</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>時間</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>休憩</th>
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((st) => (
                <tr key={st.shiftTypeId}>
                  <td style={tableCell}>{st.code}</td>
                  <td style={tableCell}>{st.labelJa || st.labelEn || '-'}</td>
                  <td style={tableCell}>
                    {st.startsAtLocal} - {st.endsAtLocal}
                  </td>
                  <td style={tableCell}>{st.breakMinutes} 分</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>提出済みの希望シフト（{periodStart} 〜 {periodEnd}）</h2>
        {requests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>希望シフトを読み込めませんでした。</p>
        ) : (
          (() => {
            const inPeriod = requests.filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd);
            if (inPeriod.length === 0) {
              return <p style={{ margin: '8px 0 0', ...mutedText }}>今週の希望シフトはまだ提出されていません。</p>;
            }
            return (
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>スタッフ</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>日付</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>希望</th>
                  </tr>
                </thead>
                <tbody>
                  {inPeriod.map((r) => (
                    <tr key={r.requestId}>
                      <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? UNKNOWN_STAFF_NAME_JA}</td>
                      <td style={tableCell}>{r.workDate}</td>
                      <td style={tableCell}>
                        {r.isUnavailable ? '出勤不可' : shiftTypeById.get(r.shiftTypeId ?? '')?.code ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>修正申請</h2>
        {correctionRequests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>修正申請を読み込めませんでした。</p>
        ) : (
          <>
            <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              要対応
            </p>
            {pendingCorrections.length === 0 ? (
              <p style={{ margin: '8px 0 0', ...mutedText }}>対応が必要な修正申請はありません。</p>
            ) : (
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>スタッフ</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>日付</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>内容</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>勤怠</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>交通費</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>日報メッセージ</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCorrections.map((r) => {
                    const message = typeof r.details.message === 'string' ? r.details.message : '-';
                    const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                    return (
                      <tr key={r.requestId}>
                        <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? UNKNOWN_STAFF_NAME_JA}</td>
                        <td style={tableCell}>{r.workDate}</td>
                        <td style={tableCell}>{message}</td>
                        <td style={tableCell}>
                          {relatedAttendance
                            ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
                            : '-'}
                        </td>
                        <td style={tableCell}>{relatedAttendance?.transportationCost ?? '-'}</td>
                        <td style={tableCell}>{relatedAttendance?.dailyMessage ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {decidedCorrections.length > 0 ? (
              <div style={{ marginTop: 16, background: demoColors.surfaceElevated, borderRadius: 8, padding: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, ...mutedText }}>最近の対応履歴</h3>
                <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>スタッフ</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>日付</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>内容</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decidedCorrections.map((r) => (
                      <tr key={r.requestId}>
                        <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? UNKNOWN_STAFF_NAME_JA}</td>
                        <td style={tableCell}>{r.workDate}</td>
                        <td style={tableCell}>{typeof r.details.message === 'string' ? r.details.message : '-'}</td>
                        <td style={tableCell}>
                          <span style={badgeStyle(r.status === 'approved' ? 'active' : 'inactive')}>
                            {r.status === 'approved' ? '承認済み' : '却下'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

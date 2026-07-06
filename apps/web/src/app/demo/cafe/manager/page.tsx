'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { ManagerAlerts } from '@/components/demo/cafe/ManagerAlerts';
import { ShiftEditModal } from '@/components/demo/cafe/ShiftEditModal';
import { ManagerReportModal } from '@/components/demo/cafe/ManagerReportModal';
import { MonthlyReportModal } from '@/components/demo/cafe/MonthlyReportModal';
import { AutoScheduleModal } from '@/components/demo/cafe/AutoScheduleModal';
import { LaborCostSummary } from '@/components/demo/cafe/LaborCostSummary';
import { SettingsPanel } from '@/components/demo/cafe/SettingsPanel';
import { StaffManagementModal } from '@/components/demo/cafe/StaffManagementModal';
import { RecipeManagementModal } from '@/components/demo/cafe/RecipeManagementModal';
import { BrandMark } from '@/components/demo/cafe/BrandMark';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { useTodayIso } from '@/lib/demo/cafe/useTodayIso';
import {
  HELP_MANAGER_AUTO_SCHEDULE,
  HELP_MANAGER_MONTHLY_REPORT,
  HELP_MANAGER_SHIFT_TABLE,
  HELP_MANAGER_STAFF_RECIPE_MANAGEMENT,
} from '@/lib/demo/cafe/helpContent';
import {
  autoScheduleFutureAssignments,
  buildWeekDateRange,
  computeManagerAlerts,
  computeShortageDateSet,
  DEMO_CAFE_NAME_JA,
  generateAssignments,
  generateWorkReports,
  MAX_MONTHLY_HOURS,
  SHIFT_TYPES,
  STAFF,
  STAFFING_REQUIREMENTS,
} from '@/lib/demo/cafe/data';
import { formatMonthDay } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, card, demoColors, mutedText, pageStyle } from '@/lib/demo/cafe/theme';
import type { ShiftAssignment, ShiftTypeDef, StaffingRequirement, WorkReport } from '@/lib/demo/cafe/types';

export default function CafeManagerDemoPage() {
  const todayIso = useTodayIso();
  const [weekOffset, setWeekOffset] = useState(0);
  const dates = useMemo(
    () => (todayIso ? buildWeekDateRange(weekOffset, new Date(`${todayIso}T00:00:00`)) : []),
    [todayIso, weekOffset],
  );

  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeDef[]>(SHIFT_TYPES);
  const [requirements, setRequirements] = useState<StaffingRequirement[]>(STAFFING_REQUIREMENTS);
  const [maxMonthlyHours, setMaxMonthlyHours] = useState(MAX_MONTHLY_HOURS);
  const [selectedCell, setSelectedCell] = useState<{ staffId: string; date: string } | null>(null);
  const [selectedPastCell, setSelectedPastCell] = useState<{ staffId: string; date: string } | null>(null);
  const [autoScheduleModalOpen, setAutoScheduleModalOpen] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [monthlyReportModalOpen, setMonthlyReportModalOpen] = useState(false);

  useEffect(() => {
    if (!todayIso) return;
    const nextAssignments = generateAssignments(dates, todayIso);
    setAssignments(nextAssignments);
    setWorkReports(generateWorkReports(dates, nextAssignments, todayIso));
  }, [todayIso, dates]);

  const alerts = useMemo(
    () => (todayIso ? computeManagerAlerts(dates, assignments, workReports, todayIso, requirements) : []),
    [dates, assignments, workReports, todayIso, requirements],
  );
  const shortageDateSet = useMemo(
    () => computeShortageDateSet(dates, assignments, requirements),
    [dates, assignments, requirements],
  );

  if (!todayIso) {
    return (
      <main style={pageStyle(1180)}>
        <p style={mutedText}>読み込み中...</p>
      </main>
    );
  }

  function handleCellClick(staffId: string, date: string) {
    // Past days are report/view only; future (and today's) shifts stay editable via ShiftEditModal.
    if (date < todayIso!) {
      setSelectedPastCell({ staffId, date });
    } else {
      setSelectedCell({ staffId, date });
    }
  }

  const selectedAssignment = selectedCell
    ? assignments.find((a) => a.staffId === selectedCell.staffId && a.date === selectedCell.date)
    : null;
  const selectedStaffName = selectedCell ? STAFF.find((staff) => staff.id === selectedCell.staffId)?.name ?? '' : '';
  const selectedReport = selectedCell
    ? workReports.find((report) => report.staffId === selectedCell.staffId && report.date === selectedCell.date)
    : null;
  const selectedCellAlerts: string[] = [];
  if (selectedReport?.hasCorrectionRequest) {
    selectedCellAlerts.push(selectedReport.message || '勤務時間の修正を依頼しています。');
  } else if (selectedReport?.message) {
    selectedCellAlerts.push(selectedReport.message);
  }
  if (selectedCell && shortageDateSet.has(selectedCell.date)) selectedCellAlerts.push('必要人数に対して人員が不足しています');

  const pastCellStaffName = selectedPastCell ? STAFF.find((staff) => staff.id === selectedPastCell.staffId)?.name ?? '' : '';
  const pastCellAssignment = selectedPastCell
    ? assignments.find((a) => a.staffId === selectedPastCell.staffId && a.date === selectedPastCell.date)
    : null;
  const pastCellReport = selectedPastCell
    ? workReports.find((report) => report.staffId === selectedPastCell.staffId && report.date === selectedPastCell.date) ?? null
    : null;

  return (
    <main style={pageStyle(1180)}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BrandMark size={52} />
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>店長ダッシュボード</h1>
          <p style={{ margin: '2px 0 0', ...mutedText }}>{DEMO_CAFE_NAME_JA}（デモ）</p>
        </div>
      </header>

      <div style={{ marginTop: 20 }}>
        <ManagerAlerts alerts={alerts} />
      </div>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ fontSize: 16 }}>シフト表</strong>
            <DemoHelpButton content={HELP_MANAGER_SHIFT_TABLE} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" style={buttonPrimary} onClick={() => setAutoScheduleModalOpen(true)}>
              自動シフト作成
            </button>
            <DemoHelpButton content={HELP_MANAGER_AUTO_SCHEDULE} />
          </div>
        </div>
        <p style={{ margin: '8px 0 4px', fontSize: 12.5, ...mutedText }}>
          セルをクリックして手動でシフトを編集できます。列見出しの「!」は必要人数に対して人員が不足している日を示します。
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
          {dates.length > 0 ? (
            <span style={{ fontSize: 14, fontWeight: 700, color: demoColors.textPrimary }}>
              {formatMonthDay(new Date(`${dates[0]}T00:00:00`))} 〜 {formatMonthDay(new Date(`${dates[dates.length - 1]}T00:00:00`))}
            </span>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={buttonSecondary} onClick={() => setWeekOffset((o) => o - 1)}>
              ← 前の週
            </button>
            <button
              type="button"
              disabled={weekOffset === 0}
              style={{ ...buttonSecondary, opacity: weekOffset === 0 ? 0.5 : 1, cursor: weekOffset === 0 ? 'not-allowed' : 'pointer' }}
              onClick={() => setWeekOffset(0)}
            >
              今日
            </button>
            <button type="button" style={buttonSecondary} onClick={() => setWeekOffset((o) => o + 1)}>
              次の週 →
            </button>
          </div>
        </div>

        <ShiftTable
          dates={dates}
          todayIso={todayIso}
          staffList={STAFF}
          assignments={assignments}
          shiftTypes={shiftTypes}
          mode="manager"
          workReports={workReports}
          shortageDateSet={shortageDateSet}
          onCellClick={handleCellClick}
        />
        <LaborCostSummary staffList={STAFF} assignments={assignments.filter((a) => a.date <= todayIso)} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
          <button type="button" style={buttonSecondary} onClick={() => setMonthlyReportModalOpen(true)}>
            月間レポートCSV
          </button>
          <DemoHelpButton content={HELP_MANAGER_MONTHLY_REPORT} />
        </div>
      </section>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ fontSize: 16 }}>スタッフ・レシピ管理</strong>
            <DemoHelpButton content={HELP_MANAGER_STAFF_RECIPE_MANAGEMENT} />
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={buttonSecondary} onClick={() => setStaffModalOpen(true)}>
            スタッフ管理
          </button>
          <button type="button" style={buttonSecondary} onClick={() => setRecipeModalOpen(true)}>
            レシピ管理
          </button>
        </div>
      </section>

      <div style={{ marginTop: 20 }}>
        <SettingsPanel
          requirements={requirements}
          onChangeRequirement={(weekday, value) =>
            setRequirements((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, requiredCount: value } : r)))
          }
          maxMonthlyHours={maxMonthlyHours}
          onChangeMaxMonthlyHours={setMaxMonthlyHours}
          shiftTypes={shiftTypes}
          assignments={assignments}
          onAddShiftType={(type) => setShiftTypes((prev) => [...prev, type])}
          onEditShiftType={(id, changes) =>
            setShiftTypes((prev) => prev.map((type) => (type.id === id ? { ...type, ...changes } : type)))
          }
          onDeleteShiftType={(id) => setShiftTypes((prev) => prev.filter((type) => type.id !== id))}
        />
      </div>

      {selectedCell ? (
        <ShiftEditModal
          open
          onClose={() => setSelectedCell(null)}
          staffName={selectedStaffName}
          date={selectedCell.date}
          currentShiftTypeId={selectedAssignment?.shiftTypeId ?? null}
          shiftTypes={shiftTypes}
          alertMessages={selectedCellAlerts}
          onSave={(shiftTypeId) => {
            setAssignments((prev) =>
              prev.map((a) =>
                a.staffId === selectedCell.staffId && a.date === selectedCell.date ? { ...a, shiftTypeId } : a,
              ),
            );
          }}
        />
      ) : null}

      {selectedPastCell ? (
        <ManagerReportModal
          key={`${selectedPastCell.staffId}-${selectedPastCell.date}`}
          open
          onClose={() => setSelectedPastCell(null)}
          staffName={pastCellStaffName}
          date={selectedPastCell.date}
          report={pastCellReport}
          assignment={pastCellAssignment}
          shiftTypes={shiftTypes}
          isShortageDay={shortageDateSet.has(selectedPastCell.date)}
        />
      ) : null}

      <AutoScheduleModal
        open={autoScheduleModalOpen}
        onClose={() => setAutoScheduleModalOpen(false)}
        onConfirm={() => {
          setAssignments((prev) => autoScheduleFutureAssignments(prev, dates, todayIso));
        }}
      />

      <StaffManagementModal open={staffModalOpen} onClose={() => setStaffModalOpen(false)} />
      <RecipeManagementModal open={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} />
      <MonthlyReportModal open={monthlyReportModalOpen} onClose={() => setMonthlyReportModalOpen(false)} staffList={STAFF} todayIso={todayIso} />
    </main>
  );
}

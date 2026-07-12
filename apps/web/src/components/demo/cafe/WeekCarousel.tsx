'use client';

import { useMemo, useRef } from 'react';
import type { TouchEvent } from 'react';
import { ShiftTable } from './ShiftTable';
import { buildWeekDateRange } from '@/lib/demo/cafe/data';
import { formatMonthDay } from '@/lib/demo/cafe/format';
import { buttonSecondary, demoColors } from '@/lib/demo/cafe/theme';
import type { ShiftAssignment, ShiftTypeDef, StaffMember, WorkReport } from '@/lib/demo/cafe/types';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

interface WeekCarouselProps {
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  todayIso: string;
  staffList: StaffMember[];
  shiftTypes: ShiftTypeDef[];
  currentStaffId: string;
  onlyCurrentStaff: boolean;
  onCellClick: (staffId: string, date: string) => void;
  lang: Lang;
  /** Current staff member's work reports (incl. today's saved message, if any) — needed so the own-row message indicator can render on the compact staff table. */
  workReports: WorkReport[];
  /** Published schedule assignments (staff must never see draft/unpublished manager edits) — filtered here to the week in view. */
  assignments: ShiftAssignment[];
}

/** Minimum horizontal swipe distance (px) before it's treated as a week-change gesture rather than a tap. */
const SWIPE_THRESHOLD = 48;

/**
 * Week paging: the week-range label and 前の週/今日/次の週 controls are a
 * stable block that never remounts or animates — only the table below it is
 * keyed by `weekOffset` and swaps on navigation, plus a swipe gesture over
 * the table area. Keeping controls out of the keyed/animated block is
 * deliberate: when they lived inside it, they visually moved/flickered along
 * with the table on every week change, which read as if the controls
 * themselves were part of the animated gallery. Deliberately avoids native
 * scrollLeft/scroll-snap for the table: with 3 adjacent week-cards laid out
 * for hand-scrolling, the browser can settle a frame away from the exact
 * snap point (visible as two half-cut adjacent weeks in the same viewport)
 * — rendering a single week and changing `weekOffset` outright sidesteps
 * that whole class of bug entirely, at the cost of not visually dragging
 * with the finger mid-swipe.
 */
export function WeekCarousel({
  weekOffset,
  onWeekOffsetChange,
  todayIso,
  staffList,
  shiftTypes,
  currentStaffId,
  onlyCurrentStaff,
  onCellClick,
  lang,
  workReports,
  assignments,
}: WeekCarouselProps) {
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const touchStartX = useRef<number | null>(null);

  const dates = useMemo(
    () => buildWeekDateRange(weekOffset, new Date(`${todayIso}T00:00:00`)),
    [weekOffset, todayIso],
  );
  const weekAssignments = useMemo(
    () => assignments.filter((assignment) => dates.includes(assignment.date)),
    [assignments, dates],
  );

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    onWeekOffsetChange(weekOffset + (delta < 0 ? 1 : -1));
  }

  return (
    <div>
      {/* Stable control row: never keyed/remounted, so it cannot animate or jump when the table below swaps weeks. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, color: demoColors.textPrimary }}>
          {formatMonthDay(new Date(`${dates[0]}T00:00:00`))} 〜 {formatMonthDay(new Date(`${dates[6]}T00:00:00`))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            style={{ ...buttonSecondary, padding: '5px 9px', fontSize: 11 }}
            onClick={() => onWeekOffsetChange(weekOffset - 1)}
          >
            ← {t('prevWeek')}
          </button>
          <button
            type="button"
            disabled={weekOffset === 0}
            style={{
              ...buttonSecondary,
              padding: '5px 9px',
              fontSize: 11,
              opacity: weekOffset === 0 ? 0.5 : 1,
              cursor: weekOffset === 0 ? 'not-allowed' : 'pointer',
            }}
            onClick={() => onWeekOffsetChange(0)}
          >
            {t('today')}
          </button>
          <button
            type="button"
            style={{ ...buttonSecondary, padding: '5px 9px', fontSize: 11 }}
            onClick={() => onWeekOffsetChange(weekOffset + 1)}
          >
            {t('nextWeek')} →
          </button>
        </div>
      </div>

      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div key={weekOffset} className="demo-cafe-week-slide">
          <ShiftTable
            dates={dates}
            todayIso={todayIso}
            staffList={staffList}
            assignments={weekAssignments}
            shiftTypes={shiftTypes}
            mode="staff"
            currentStaffId={currentStaffId}
            onlyCurrentStaff={onlyCurrentStaff}
            workReports={workReports}
            onCellClick={onCellClick}
            compact
            lang={lang}
          />
        </div>
        <style>{`
          .demo-cafe-week-slide { animation: demo-cafe-week-fade 150ms ease-out; }
          @keyframes demo-cafe-week-fade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

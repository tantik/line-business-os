'use client';

import { useState, type ReactNode } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import type { WorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import { PreviewManagerViewChrome } from './preview-manager-view-chrome';
import { PreviewStaffRecipeManagement } from './preview-staff-recipe-management';
import { PreviewSettingsCard } from './preview-settings-card';
import { PreviewShiftExchangeManagerPanel } from './preview-shift-exchange-manager-panel';

/**
 * Owns the one shared, live copy of `staff`/`shiftTypes` for everything
 * rendered under the Manager シフト表 card - `PreviewManagerViewChrome` (the
 * schedule grid's roster + shift-type selectors/legend) is a *sibling*, not
 * a parent/child, of `PreviewStaffRecipeManagement` ("Manage Staff") and
 * `PreviewSettingsCard` ("Shift Types"), each of which previously owned its
 * own independent `useState` copy seeded once from the page's initial load.
 * A staff/shift-type create-edit-deactivate mutation patched only the
 * mutating island's own copy (never `router.refresh()`, by design - see
 * those components' own doc comments), so the Shift Schedule grid stayed
 * stale until a full page reload - Founder QA F02/F03/F11.
 *
 * This wrapper is the single source of truth instead: seeded once from the
 * server-rendered initial props, patched by `onStaffChanged`/
 * `onShiftTypesChanged` callbacks the mutating islands already call after a
 * successful scoped refetch, and read by every consumer below. Still no
 * `router.refresh()` anywhere in this tree - only a client-side state lift.
 */
export interface PreviewManagerRosterSectionProps {
  // PreviewManagerViewChrome (schedule) props, minus staff/shiftTypes (owned here).
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  assignments: WorkforceShiftAssignment[] | null;
  allAssignments: WorkforceShiftAssignment[] | null;
  attendance: WorkforceAttendance[] | null;
  basePath: string;
  requiredHeadcountByWeekday: number[];

  // Shared source-of-truth seeds.
  initialStaff: WorkforceStaffManageEntry[] | null;
  initialShiftTypes: WorkforceShiftType[] | null;

  // PreviewStaffRecipeManagement props, minus staff (owned here).
  recipes: WorkforceRecipe[] | null;
  recipeMediaUrls?: Record<string, string>;
  inventorySlot?: ReactNode;

  // PreviewSettingsCard props, minus shiftTypes (owned here).
  settings: WorkforceScheduleSettings | null;

  /**
   * `PreviewShiftExchangeManagerPanel` also displays shift-type labels and
   * must stay in sync with Settings - rendered here (not passed in as a
   * function-returning-JSX prop) because a Server Component (the page) can
   * only pass a Client Component *plain data* or already-built JSX across
   * the RSC boundary, never a closure - only a `'use server'` Server Action
   * may cross that boundary as a callable. `null` when the exchange data
   * itself failed to load (the page already applies that gate before
   * building this prop).
   */
  exchangePanelData: {
    timeZone: string;
    assignments: WorkforceShiftAssignment[];
    exchanges: WorkforceShiftExchange[];
    staffNameById: Record<string, string>;
  } | null;
}

export function PreviewManagerRosterSection({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  assignments,
  allAssignments,
  attendance,
  basePath,
  requiredHeadcountByWeekday,
  initialStaff,
  initialShiftTypes,
  recipes,
  recipeMediaUrls,
  inventorySlot,
  settings,
  exchangePanelData,
}: PreviewManagerRosterSectionProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [shiftTypes, setShiftTypes] = useState(initialShiftTypes);
  // A removed/deactivated staff member must never appear as a schedulable
  // row by default - same invariant `manager/page.tsx` applies server-side
  // to the initial load, re-applied here since this is now the live copy.
  const activeStaff = staff === null ? null : staff.filter((entry) => entry.isActive);

  return (
    <>
      <PreviewManagerViewChrome
        timeZone={timeZone}
        periodStart={periodStart}
        periodEnd={periodEnd}
        weekOffset={weekOffset}
        staff={activeStaff}
        shiftTypes={shiftTypes}
        assignments={assignments}
        allAssignments={allAssignments}
        attendance={attendance}
        basePath={basePath}
        requiredHeadcountByWeekday={requiredHeadcountByWeekday}
      />

      <PreviewStaffRecipeManagement
        staff={staff}
        recipes={recipes}
        recipeMediaUrls={recipeMediaUrls}
        inventorySlot={inventorySlot}
        onStaffChanged={setStaff}
      />

      <PreviewSettingsCard shiftTypes={shiftTypes} settings={settings} onShiftTypesChanged={setShiftTypes} />

      {exchangePanelData ? (
        <PreviewShiftExchangeManagerPanel
          timeZone={exchangePanelData.timeZone}
          assignments={exchangePanelData.assignments}
          exchanges={exchangePanelData.exchanges}
          staffNameById={exchangePanelData.staffNameById}
          shiftTypes={shiftTypes ?? []}
        />
      ) : null}
    </>
  );
}

import type { ReactNode } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { PreviewManagerViewChrome } from './preview-manager-view-chrome';

/**
 * Phase 1N-4C Slice B1 - action-free, read-only manager display for the Mame
 * To Cha preview. Deliberately NOT `'use client'` and imports nothing from
 * `staff-actions.ts`/`schedule-actions.ts`/`attendance-actions.ts` and no
 * mutation-form component (`StaffForm`/`LineLinkForm`/`ShiftCellEditor`) - a
 * plain server component has no client bundle at all, so there is no
 * `next build` client-reference-manifest entry for this file to register a
 * Server Action against (verified by `preview-action-free.test.ts`'s
 * `!/^\s*['"]use client['"]/m` assertion on this exact file, and by
 * `scripts/verify-preview-server-actions.mjs`).
 *
 * All actual rendering (including i18n, which requires `useLang()`, a client
 * hook) lives in `PreviewManagerViewChrome` (`preview-manager-view-chrome.tsx`,
 * `'use client'`). This file is a bare pass-through so the "manager-view.tsx
 * must not be a client component" invariant holds regardless of how much the
 * rendered chrome changes.
 */
export interface PreviewManagerViewProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  staff: WorkforceStaffManageEntry[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  attendance: WorkforceAttendance[] | null;
  /** Public preview route base, e.g. `/mame-to-cha` - used for week-navigation links only. */
  basePath: string;
  /** Dialog-trigger buttons (auto-distribute/publish, shift add/edit) rendered by the page - a Client Component, passed down as an already-resolved node. */
  actionsSlot?: ReactNode;
}

export function PreviewManagerView(props: PreviewManagerViewProps) {
  return <PreviewManagerViewChrome {...props} />;
}

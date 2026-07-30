/**
 * Types for the public Mirawi Cafe Demo (`/demo/cafe*`).
 *
 * Demo-only: all data is mock/sample and lives in client state for the
 * session. No tenant_id/location_id here on purpose — production will add
 * those when this becomes a real module (see the phase-1j-2 plan doc).
 */

export type ShiftTypeId = string;

export interface ShiftTypeDef {
  id: ShiftTypeId;
  label: string;
  startTime?: string;
  endTime?: string;
  isTimeOff?: boolean;
  isCustom?: boolean;
}

export type StaffRole = 'manager' | 'staff';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  hourlyWageYen: number;
  defaultTransportYen: number;
  submittedPreference: boolean;
}

export interface ShiftAssignment {
  staffId: string;
  date: string;
  shiftTypeId: ShiftTypeId | null;
}

/** Demo-only work-time correction request a staff member can attach to a past shift report. */
export interface CorrectionRequest {
  requestedClockIn?: string;
  requestedClockOut?: string;
  requestedBreakMinutes?: number;
  reason: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface WorkReport {
  staffId: string;
  date: string;
  plannedLabel: string;
  actualClockIn: string | null;
  breakMinutes: number;
  actualClockOut: string | null;
  actualWorkedHours: number | null;
  transportYen: number;
  /** Original message text, in whatever language the staff member wrote it. */
  message: string;
  /** Static demo-only translation of `message` (e.g. EN message -> JA translation for the manager view). Only present for a handful of seeded demo reports — never produced dynamically. */
  messageTranslated?: string;
  hasCorrectionRequest: boolean;
  /** Present whenever `hasCorrectionRequest` is true — the concrete requested values behind the "!" indicator. */
  correctionRequest?: CorrectionRequest;
  /** Live ClockPanel state for today's report, demo-only. Absent (or on seeded past reports) is treated as 'idle'. */
  clockState?: ClockState;
}

export interface Recipe {
  id: string;
  /** Operational instructions share the catalog but are always shown before recipes. */
  contentKind?: 'recipe' | 'instruction';
  name: string;
  category: string;
  badges: Array<'人気' | 'New' | '季節限定'>;
  icon: string;
  /** Optional demo product photo (public/ path). Falls back to the emoji `icon` when absent. */
  image?: string;
  description: string;
  ingredients: string[];
  steps: string[];
  /** Heading for the optional memo block below the steps (defaults to a generic "メモ" label when memo is set without one). */
  memoTitle?: string;
  memo?: string;
  /** Static English demo content — manually authored, not machine-translated. Falls back to the JA fields when absent. */
  nameEn?: string;
  descriptionEn?: string;
  ingredientsEn?: string[];
  stepsEn?: string[];
  memoTitleEn?: string;
  memoEn?: string;
  /** Staff-facing provenance for dynamic user-authored English content. */
  translationNotice?: 'original' | 'machine' | 'reviewed';
}

export interface StaffingRequirement {
  weekday: number; // 0 = 月 ... 6 = 日
  requiredCount: number;
}

export type ClockState = 'idle' | 'clocked_in' | 'on_break' | 'clocked_out';

export interface ManagerAlert {
  id: string;
  label: string;
  tone: 'warning' | 'danger';
}

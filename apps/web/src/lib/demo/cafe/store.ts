'use client';

/**
 * Shared frontend-only state for the public Mirawi Cafe / Mame To Cha demo.
 *
 * Manager (`ManagerView`) and staff (`StaffView`) render as two separate
 * component trees under two separate routes. Before this store existed, each
 * one independently re-seeded the same deterministic demo generators from
 * `./data`, so nothing one side did (editing a shift, publishing a schedule,
 * submitting a correction request) was ever visible to the other. This
 * module is the single source of truth both sides read and write instead,
 * persisted to localStorage (so it survives navigation between routes and
 * page reloads) and broadcast across tabs via the native `storage` event
 * plus a same-tab `CustomEvent` (storage events don't fire in the tab that
 * made the change).
 *
 * Demo-only: no backend, no auth, no real persistence guarantee. See
 * docs/phase-1j-2-cafe-workforce-demo-to-production-plan.md for what a real
 * module would need instead.
 */

import { useSyncExternalStore } from 'react';
import {
  autoScheduleFutureAssignments,
  generateAssignments,
  generateWorkReports,
  STAFF,
} from './data';
import { addDays, startOfDay, toISODate } from './format';
import type { CorrectionRequest, ShiftAssignment, WorkReport } from './types';

const STORAGE_KEY = 'demo-cafe-store-v1';
const UPDATE_EVENT = 'demo-cafe-store-updated';

export interface DemoCafeStoreState {
  /** Calendar date (ISO) the current seed was generated for. Used to detect day rollover and reseed. */
  seedDateIso: string;
  /** Manager's working copy of the schedule — edits here are not yet visible to staff. */
  assignmentsDraft: ShiftAssignment[];
  /** What staff actually see. Equal to the draft until the manager publishes. */
  assignmentsPublished: ShiftAssignment[];
  /** ISO timestamp of the last publish, or null if nothing has been published yet this seed. */
  publishedAt: string | null;
  /** Shared work reports (messages, clock times, correction requests) for both manager and staff views. */
  workReports: WorkReport[];
}

const EMPTY_STORE: DemoCafeStoreState = {
  seedDateIso: '',
  assignmentsDraft: [],
  assignmentsPublished: [],
  publishedAt: null,
  workReports: [],
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function currentTodayIso(): string {
  return toISODate(new Date());
}

/**
 * Wider window than any single view needs on its own (manager can page
 * several weeks forward/back; staff sees a 14-day window) so both always
 * read from the same seeded range without gaps at the edges.
 */
function buildStoreDateRange(today: Date): string[] {
  const base = startOfDay(today);
  const dates: string[] = [];
  for (let offset = -21; offset <= 35; offset += 1) {
    dates.push(toISODate(addDays(base, offset)));
  }
  return dates;
}

function buildSeedState(todayIso: string): DemoCafeStoreState {
  const dates = buildStoreDateRange(new Date(`${todayIso}T00:00:00`));
  const assignments = generateAssignments(dates, todayIso);
  const workReports = generateWorkReports(dates, assignments, todayIso);
  return {
    seedDateIso: todayIso,
    assignmentsDraft: assignments,
    // Past/today start identical in draft and published so the demo never opens to an empty staff schedule.
    assignmentsPublished: assignments,
    publishedAt: null,
    workReports,
  };
}

let cachedState: DemoCafeStoreState = EMPTY_STORE;

function readFromStorage(): DemoCafeStoreState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoCafeStoreState>;
    if (
      typeof parsed.seedDateIso !== 'string' ||
      !Array.isArray(parsed.assignmentsDraft) ||
      !Array.isArray(parsed.assignmentsPublished) ||
      !Array.isArray(parsed.workReports)
    ) {
      return null;
    }
    return {
      seedDateIso: parsed.seedDateIso,
      assignmentsDraft: parsed.assignmentsDraft,
      assignmentsPublished: parsed.assignmentsPublished,
      publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
      workReports: parsed.workReports,
    };
  } catch {
    // Stale/corrupt shape from a prior dev session — fall back to a fresh seed rather than throwing.
    return null;
  }
}

function writeToStorage(state: DemoCafeStoreState) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Demo-only best-effort persistence — ignore quota/serialization errors.
  }
}

function persist(state: DemoCafeStoreState) {
  cachedState = state;
  writeToStorage(state);
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
}

/** Loads the store, reseeding whenever nothing is stored yet or the stored seed is for a different calendar day. */
function ensureLoaded(): DemoCafeStoreState {
  if (!isBrowser()) return cachedState;
  const todayIso = currentTodayIso();
  const stored = readFromStorage();
  if (stored && stored.seedDateIso === todayIso) {
    cachedState = stored;
    return cachedState;
  }
  const seeded = buildSeedState(todayIso);
  cachedState = seeded;
  writeToStorage(seeded);
  return cachedState;
}

function getSnapshot(): DemoCafeStoreState {
  return ensureLoaded();
}

function getServerSnapshot(): DemoCafeStoreState {
  return EMPTY_STORE;
}

function subscribe(callback: () => void): () => void {
  if (!isBrowser()) return () => {};
  function handleStorage(event: StorageEvent) {
    if (event.key && event.key !== STORAGE_KEY) return;
    callback();
  }
  window.addEventListener('storage', handleStorage);
  window.addEventListener(UPDATE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(UPDATE_EVENT, callback);
  };
}

/** React hook exposing the live shared demo store. Re-renders on same-tab mutations and cross-tab storage events. */
export function useDemoCafeStore(): DemoCafeStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function withState(mutate: (state: DemoCafeStoreState) => DemoCafeStoreState) {
  const current = ensureLoaded();
  persist(mutate(current));
}

/** Manager edits a single cell — writes to the draft only, never directly visible to staff until published. */
export function updateDraftAssignment(staffId: string, date: string, shiftTypeId: string | null) {
  withState((state) => ({
    ...state,
    assignmentsDraft: state.assignmentsDraft.map((assignment) =>
      assignment.staffId === staffId && assignment.date === date ? { ...assignment, shiftTypeId } : assignment,
    ),
  }));
}

/** Wraps the existing `autoScheduleFutureAssignments` generator, applied to the draft only. */
export function autoScheduleDraft(dates: string[], todayIso: string) {
  withState((state) => ({
    ...state,
    assignmentsDraft: autoScheduleFutureAssignments(state.assignmentsDraft, dates, todayIso),
  }));
}

/** Copies the manager's draft schedule into what staff see, and stamps the publish time. */
export function publishSchedule() {
  withState((state) => ({
    ...state,
    assignmentsPublished: state.assignmentsDraft,
    publishedAt: new Date().toISOString(),
  }));
}

function upsertWorkReport(
  state: DemoCafeStoreState,
  staffId: string,
  date: string,
  patch: Partial<WorkReport>,
): DemoCafeStoreState {
  const index = state.workReports.findIndex((report) => report.staffId === staffId && report.date === date);
  if (index >= 0) {
    const next = [...state.workReports];
    next[index] = { ...next[index]!, ...patch };
    return { ...state, workReports: next };
  }
  const staff = STAFF.find((candidate) => candidate.id === staffId);
  const created: WorkReport = {
    staffId,
    date,
    plannedLabel: '－',
    actualClockIn: null,
    breakMinutes: 0,
    actualClockOut: null,
    actualWorkedHours: null,
    transportYen: staff?.defaultTransportYen ?? 0,
    message: '',
    hasCorrectionRequest: false,
    ...patch,
  };
  return { ...state, workReports: [...state.workReports, created] };
}

/** Staff saves their "today's message" — shared so the manager dashboard sees the same report. */
export function saveTodayMessage(staffId: string, date: string, message: string) {
  withState((state) => upsertWorkReport(state, staffId, date, { message }));
}

export interface CorrectionRequestSubmission {
  date: string;
  actualClockIn?: string;
  actualClockOut?: string;
  breakMinutes: number;
  message: string;
}

/** Staff submits a work-time correction request, flagging the shared report for manager review. */
export function submitCorrectionRequest(staffId: string, payload: CorrectionRequestSubmission) {
  withState((state) => {
    const existing = state.workReports.find((report) => report.staffId === staffId && report.date === payload.date);
    const correctionRequest: CorrectionRequest = {
      requestedClockIn: payload.actualClockIn || undefined,
      requestedClockOut: payload.actualClockOut || undefined,
      requestedBreakMinutes: payload.breakMinutes,
      reason: payload.message || existing?.message || '',
      status: 'pending',
    };
    return upsertWorkReport(state, staffId, payload.date, {
      actualClockIn: payload.actualClockIn || existing?.actualClockIn || null,
      actualClockOut: payload.actualClockOut || existing?.actualClockOut || null,
      breakMinutes: payload.breakMinutes,
      message: payload.message || existing?.message || '',
      hasCorrectionRequest: true,
      correctionRequest,
    });
  });
}

/** Manager approves or rejects a pending correction request — the resolution persists in the shared store. */
export function resolveCorrectionRequest(staffId: string, date: string, status: 'approved' | 'rejected') {
  withState((state) => {
    const existing = state.workReports.find((report) => report.staffId === staffId && report.date === date);
    if (!existing?.correctionRequest) return state;
    return upsertWorkReport(state, staffId, date, {
      correctionRequest: { ...existing.correctionRequest, status },
    });
  });
}

/** Staff clocks in/out or starts/ends a break — feeds the same shared report as the message, not disconnected local UI. */
export function recordClockEvent(
  staffId: string,
  date: string,
  patch: Partial<Pick<WorkReport, 'actualClockIn' | 'actualClockOut' | 'breakMinutes'>>,
) {
  withState((state) => upsertWorkReport(state, staffId, date, patch));
}

/** Clears the demo back to a fresh seed — safe to call repeatedly between client demo runs. */
export function resetDemoStore() {
  if (!isBrowser()) return;
  persist(buildSeedState(currentTodayIso()));
}

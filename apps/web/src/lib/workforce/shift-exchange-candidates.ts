/**
 * Shift Exchange Manager Resolution UX: pure derivation of the candidate
 * list shown in the "Assign replacement" selector -- reuses data the
 * Manager dashboard already loads (staff roster, published assignments,
 * submitted shift preferences), the same source `manager-attention.ts`'s
 * `computeUnavailableConflictCellKeys` and the schedule grid's own markers
 * already read. Mirrors (client-side, warning-only) the exact overlap check
 * `api.manager_assign_shift_exchange_replacement`/`api.accept_workforce_shift_exchange`
 * enforce authoritatively server-side (0044/0079) -- this module does not
 * invent a new conflict rule, it previews the same one so a Manager isn't
 * surprised by a rejected assignment. The server RPC remains the real
 * enforcement boundary regardless of what this computes.
 */

export interface ShiftExchangeCandidateEmployeeInput {
  employeeId: string;
  name: string;
  isActive: boolean;
}

/** Another employee's assignment to check for a schedule conflict against the offered shift -- `employeeId: null` (unassigned) and `published: false` (draft) rows are ignored, same as the server-side check. */
export interface ShiftExchangeCandidateAssignmentInput {
  employeeId: string | null;
  startsAt: string;
  endsAt: string;
  published: boolean;
}

/** Minimal shape of a submitted shift preference/request, same as `manager-attention.ts`'s `UnavailableConflictRequestInput`. */
export interface ShiftExchangeCandidatePreferenceInput {
  employeeId: string;
  workDate: string;
  kind: string;
  isUnavailable: boolean;
}

export type ShiftExchangeCandidateWarning = 'schedule_conflict' | 'marked_unavailable' | null;

export interface ShiftExchangeCandidate {
  employeeId: string;
  name: string;
  warning: ShiftExchangeCandidateWarning;
}

/**
 * Eligible replacement candidates for one exchange request's offered shift:
 * every active employee except the requester, each annotated with a warning
 * (never a hard block -- the mission's own guidance: "marked unavailable"
 * has never been a hard block in the existing accept/decide RPCs, only an
 * overlapping *published* shift is) so the Manager can make an informed
 * choice. Sorted by name for a stable, scannable list.
 */
export function computeShiftExchangeCandidates(
  employees: readonly ShiftExchangeCandidateEmployeeInput[],
  excludeEmployeeId: string,
  offeredShift: { startsAt: string; endsAt: string; workDate: string },
  otherAssignments: readonly ShiftExchangeCandidateAssignmentInput[],
  preferences: readonly ShiftExchangeCandidatePreferenceInput[],
): ShiftExchangeCandidate[] {
  const offeredStart = Date.parse(offeredShift.startsAt);
  const offeredEnd = Date.parse(offeredShift.endsAt);

  const unavailableEmployeeIds = new Set(
    preferences.filter((p) => p.kind === 'preference' && p.isUnavailable && p.workDate === offeredShift.workDate).map((p) => p.employeeId),
  );

  const conflictedEmployeeIds = new Set<string>();
  for (const a of otherAssignments) {
    if (!a.employeeId || !a.published) continue;
    const start = Date.parse(a.startsAt);
    const end = Date.parse(a.endsAt);
    if (start < offeredEnd && end > offeredStart) conflictedEmployeeIds.add(a.employeeId);
  }

  return employees
    .filter((e) => e.isActive && e.employeeId !== excludeEmployeeId)
    .map((e) => ({
      employeeId: e.employeeId,
      name: e.name,
      warning: conflictedEmployeeIds.has(e.employeeId) ? ('schedule_conflict' as const) : unavailableEmployeeIds.has(e.employeeId) ? ('marked_unavailable' as const) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

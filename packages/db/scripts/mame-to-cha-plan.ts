/**
 * Idempotent fixture plan builder for the Mame To Cha onboarding rehearsal
 * (Phase 1N-4C Slice C1).
 *
 * SCOPE — PURE. No I/O, no database connection. Mirrors the existing
 * `buildOnboardingPlan` shape (`onboard-tenant.ts`) extended with the
 * Workforce-specific fixture entities this rehearsal needs (employee
 * binding, shift types, recipes, and the minimal schedule/attendance/
 * request acceptance data), so a future `apply` (Slice C2) can reuse the
 * same "create vs reuse" decisions this module already computed, instead of
 * re-deriving them at write time. Every operation is redaction-safe by
 * construction: this plan carries no email, password, or UUID -- only
 * fixture logical ids, entity/action labels, and counts.
 */
import type { MameToChaFixtureManifest } from './mame-to-cha-fixture.js';

export type PlanEntity =
  | 'tenant'
  | 'user_mirror'
  | 'location'
  | 'tenant_module'
  | 'membership'
  | 'role_assignment'
  | 'employee_binding'
  | 'shift_type'
  | 'recipe_category'
  | 'recipe'
  | 'shift_assignment'
  | 'shift_preference_request'
  | 'work_report'
  | 'correction_request';

export type PlanAction = 'create' | 'reuse' | 'activate' | 'enable' | 'conflict';

export interface PlanOperation {
  entity: PlanEntity;
  action: PlanAction;
  /** Fixture-owned logical key (e.g. a role logicalId or shift-type code) -- never a UUID or secret. */
  key: string;
}

/**
 * Non-PII, non-secret mock of already-existing fixture-owned state, used to
 * decide create vs reuse. All optional; an empty object plans a brand-new
 * fixture from scratch.
 */
export interface ExistingMameToChaFixtureState {
  tenantExists?: boolean;
  /**
   * Whether a `core.users` mirror row already exists for each role's auth
   * user id, keyed by fixture logical id (never a UUID). Required BEFORE
   * `membership`/`employee_binding` can be written -- both FK to
   * `core.users(id)`, and there is no auto-mirror trigger from `auth.users`
   * (matching the generic onboarding tool's own documented convention).
   */
  userMirrorsByLogicalId?: Record<string, boolean | undefined>;
  locationExists?: boolean;
  enabledModules?: readonly string[];
  membershipsByLogicalId?: Record<string, 'active' | 'invited' | 'suspended' | 'revoked' | undefined>;
  roleAssignmentsByLogicalId?: Record<string, boolean | undefined>;
  employeeBindingsByLogicalId?: Record<string, boolean | undefined>;
  shiftTypeCodesPresent?: readonly string[];
  recipeCategoryLabelsPresent?: readonly string[];
  recipeTitlesPresent?: readonly string[];
  acceptanceDataPresent?: {
    shiftAssignment?: boolean;
    shiftPreferenceRequest?: boolean;
    workReport?: boolean;
    correctionRequest?: boolean;
  };
}

export interface MameToChaFixturePlan {
  ok: boolean;
  tenantSlug: string;
  operations: PlanOperation[];
  conflicts: string[];
}

/**
 * Build the idempotent fixture plan. PURE: no database, no side effects.
 * Reuse-vs-create is decided exactly like `buildOnboardingPlan` (fail closed
 * on ambiguity rather than guessing); a `conflict` short-circuits before any
 * dependent operation is planned.
 */
export function buildMameToChaFixturePlan(
  fixture: MameToChaFixtureManifest,
  existingState: ExistingMameToChaFixtureState = {},
): MameToChaFixturePlan {
  const operations: PlanOperation[] = [];
  const conflicts: string[] = [];

  operations.push({
    entity: 'tenant',
    action: existingState.tenantExists ? 'reuse' : 'create',
    key: fixture.tenant.slug,
  });

  // Manager/staff core.users mirrors -- must be planned (and, at write time,
  // created) BEFORE membership/employee_binding, both of which FK to
  // core.users(id). Keyed by fixture logical id, never a UUID.
  for (const role of fixture.roles) {
    const hasMirror = existingState.userMirrorsByLogicalId?.[role.logicalId] === true;
    operations.push({
      entity: 'user_mirror',
      action: hasMirror ? 'reuse' : 'create',
      key: role.logicalId,
    });
  }

  operations.push({
    entity: 'location',
    action: existingState.locationExists ? 'reuse' : 'create',
    key: fixture.location.logicalId,
  });

  const enabledModules = new Set((existingState.enabledModules ?? []).map((m) => m.toLowerCase()));
  for (const module of ['core', ...fixture.modules]) {
    operations.push({
      entity: 'tenant_module',
      action: enabledModules.has(module.toLowerCase()) ? 'reuse' : 'enable',
      key: module,
    });
  }

  for (const role of fixture.roles) {
    const membershipStatus = existingState.membershipsByLogicalId?.[role.logicalId];
    if (membershipStatus === 'suspended' || membershipStatus === 'revoked') {
      conflicts.push(
        `Membership for "${role.logicalId}" is ${membershipStatus}; onboarding does not silently reactivate it.`,
      );
      operations.push({ entity: 'membership', action: 'conflict', key: role.logicalId });
      continue;
    }
    let membershipAction: PlanAction;
    if (!membershipStatus) membershipAction = 'create';
    else if (membershipStatus !== 'active') membershipAction = 'activate';
    else membershipAction = 'reuse';
    operations.push({ entity: 'membership', action: membershipAction, key: role.logicalId });

    const hasRoleAssignment = existingState.roleAssignmentsByLogicalId?.[role.logicalId] === true;
    operations.push({
      entity: 'role_assignment',
      action: hasRoleAssignment ? 'reuse' : 'create',
      key: `${role.logicalId}:${role.role}`,
    });

    if (role.requiresEmployeeBinding) {
      const hasBinding = existingState.employeeBindingsByLogicalId?.[role.logicalId] === true;
      operations.push({
        entity: 'employee_binding',
        action: hasBinding ? 'reuse' : 'create',
        key: role.logicalId,
      });
    }
  }

  const existingShiftCodes = new Set(existingState.shiftTypeCodesPresent ?? []);
  for (const shiftType of fixture.shiftTypes) {
    operations.push({
      entity: 'shift_type',
      action: existingShiftCodes.has(shiftType.code) ? 'reuse' : 'create',
      key: shiftType.code,
    });
  }

  const existingCategories = new Set(existingState.recipeCategoryLabelsPresent ?? []);
  const existingRecipeTitles = new Set(existingState.recipeTitlesPresent ?? []);
  const seenCategories = new Set<string>();
  for (const recipe of fixture.recipes) {
    if (!seenCategories.has(recipe.categoryLabelJa)) {
      seenCategories.add(recipe.categoryLabelJa);
      operations.push({
        entity: 'recipe_category',
        action: existingCategories.has(recipe.categoryLabelJa) ? 'reuse' : 'create',
        key: recipe.categoryLabelJa,
      });
    }
    operations.push({
      entity: 'recipe',
      action: existingRecipeTitles.has(recipe.titleJa) ? 'reuse' : 'create',
      key: recipe.titleJa,
    });
  }

  const acceptancePresent = existingState.acceptanceDataPresent ?? {};
  operations.push({
    entity: 'shift_assignment',
    action: acceptancePresent.shiftAssignment ? 'reuse' : 'create',
    key: `staff-1:day+${fixture.acceptanceData.shiftAssignmentDayOffset}`,
  });
  operations.push({
    entity: 'shift_preference_request',
    action: acceptancePresent.shiftPreferenceRequest ? 'reuse' : 'create',
    key: `staff-1:day+${fixture.acceptanceData.shiftPreferenceDayOffset}`,
  });
  operations.push({
    entity: 'work_report',
    action: acceptancePresent.workReport ? 'reuse' : 'create',
    key: `staff-1:day${fixture.acceptanceData.workReportDayOffset}`,
  });
  operations.push({
    entity: 'correction_request',
    action: acceptancePresent.correctionRequest ? 'reuse' : 'create',
    key: `staff-1:day${fixture.acceptanceData.correctionRequestDayOffset}`,
  });

  return { ok: conflicts.length === 0, tenantSlug: fixture.tenant.slug, operations, conflicts };
}

export interface RedactedMameToChaPlanSummary {
  tenantSlug: string;
  ok: boolean;
  operationCounts: Record<string, number>;
  operations: { entity: PlanEntity; action: PlanAction; key: string }[];
  conflictCount: number;
  conflicts: string[];
}

/**
 * Project a plan into a log-safe summary. Includes only fixture logical
 * keys (role logicalIds, shift-type codes, recipe titles) -- never a real
 * UUID, email, or secret, matching `redactOnboardingSummary`'s discipline.
 */
export function redactMameToChaPlanSummary(plan: MameToChaFixturePlan): RedactedMameToChaPlanSummary {
  const operationCounts: Record<string, number> = {};
  for (const op of plan.operations) {
    const countKey = `${op.entity}.${op.action}`;
    operationCounts[countKey] = (operationCounts[countKey] ?? 0) + 1;
  }
  return {
    tenantSlug: plan.tenantSlug,
    ok: plan.ok,
    operationCounts,
    operations: plan.operations.map((op) => ({ entity: op.entity, action: op.action, key: op.key })),
    conflictCount: plan.conflicts.length,
    conflicts: plan.conflicts,
  };
}

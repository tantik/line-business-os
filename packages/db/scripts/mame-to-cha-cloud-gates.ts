/**
 * Pure safety contract for Mame To Cha Cloud acceptance onboarding.
 *
 * This module performs no I/O and contains no credentials. It deliberately
 * does not reuse or weaken the local-only rehearsal guards. Each invocation
 * may select exactly one independently approved gate.
 */
import type { PlanEntity } from './mame-to-cha-plan.js';

export const MAME_TO_CHA_ACCEPTANCE_TARGET = {
  projectName: 'line-business-os-dev',
  projectRef: 'pehcoenozjtsjdvjietj',
  environment: 'acceptance',
  tenantSlug: 'mame-to-cha',
} as const;

export type MameToChaCloudGate = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7';
export type MameToChaCloudGateKind = 'database-write' | 'auth-write' | 'read-only';

export interface MameToChaCloudGateDefinition {
  gate: MameToChaCloudGate;
  kind: MameToChaCloudGateKind;
  description: string;
  planEntities: readonly PlanEntity[];
  requiresPii: boolean;
  compensation: string;
}

export const MAME_TO_CHA_CLOUD_GATES: Readonly<Record<MameToChaCloudGate, MameToChaCloudGateDefinition>> = {
  D1: {
    gate: 'D1',
    kind: 'database-write',
    description: 'Create or verify the acceptance tenant and location.',
    planEntities: ['tenant', 'location'],
    requiresPii: false,
    compensation: 'Remove only the newly created location and tenant after a separate cleanup approval.',
  },
  D2: {
    gate: 'D2',
    kind: 'database-write',
    description: 'Enable the Workforce tenant module.',
    planEntities: ['tenant_module'],
    requiresPii: false,
    compensation: 'Disable only the newly enabled module after a separate approval.',
  },
  D3: {
    gate: 'D3',
    kind: 'auth-write',
    description: 'Create the synthetic manager and staff Auth identities.',
    planEntities: [],
    requiresPii: false,
    compensation: 'Delete only the newly created synthetic identities after a separate Auth cleanup approval.',
  },
  D4: {
    gate: 'D4',
    kind: 'database-write',
    description: 'Create user mirrors, memberships, and role assignments.',
    planEntities: ['user_mirror', 'membership', 'role_assignment'],
    requiresPii: false,
    compensation: 'Revoke only fixture-owned role assignments and memberships after a separate approval.',
  },
  D5: {
    gate: 'D5',
    kind: 'database-write',
    description: 'Create the staff employee binding with encrypted synthetic PII.',
    planEntities: ['employee_binding'],
    requiresPii: true,
    compensation: 'Deactivate only the fixture-owned employee binding after a separate PII cleanup approval.',
  },
  D6: {
    gate: 'D6',
    kind: 'database-write',
    description: 'Apply deterministic acceptance content and audit rows.',
    planEntities: [
      'shift_type',
      'recipe_category',
      'recipe',
      'shift_assignment',
      'shift_preference_request',
      'work_report',
      'correction_request',
    ],
    requiresPii: false,
    compensation: 'Remove only fixture-owned acceptance content in reverse dependency order after separate approval.',
  },
  D7: {
    gate: 'D7',
    kind: 'read-only',
    description: 'Run read-only verification.',
    planEntities: [],
    requiresPii: false,
    compensation: 'None; this gate is read-only.',
  },
};

export interface MameToChaCloudGateInput {
  gate?: string;
  projectRef?: string;
  targetEnvironment?: string;
  confirm?: string;
  mode: 'plan' | 'execute';
}

export interface ValidatedMameToChaCloudGate {
  definition: MameToChaCloudGateDefinition;
  projectName: typeof MAME_TO_CHA_ACCEPTANCE_TARGET.projectName;
  projectRef: typeof MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef;
  environment: typeof MAME_TO_CHA_ACCEPTANCE_TARGET.environment;
  tenantSlug: typeof MAME_TO_CHA_ACCEPTANCE_TARGET.tenantSlug;
  confirmationRequired: string | null;
}

export function cloudGateConfirmation(gate: MameToChaCloudGate): string {
  return `EXECUTE ${gate} ON ${MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef} FOR ${MAME_TO_CHA_ACCEPTANCE_TARGET.tenantSlug}`;
}

export function validateMameToChaCloudGate(input: MameToChaCloudGateInput): ValidatedMameToChaCloudGate {
  if (input.gate === undefined || !(input.gate in MAME_TO_CHA_CLOUD_GATES)) {
    throw new Error('Exactly one valid gate (D1-D7) is required.');
  }
  const gate = input.gate as MameToChaCloudGate;
  const definition = MAME_TO_CHA_CLOUD_GATES[gate];

  if (input.projectRef !== MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef) {
    throw new Error('Project ref does not match the reviewed acceptance target.');
  }
  if (input.targetEnvironment !== MAME_TO_CHA_ACCEPTANCE_TARGET.environment) {
    throw new Error('Target environment must be exactly "acceptance"; production is forbidden.');
  }

  const required = definition.kind === 'read-only' ? null : cloudGateConfirmation(gate);
  if (input.mode === 'execute' && required !== null && input.confirm !== required) {
    throw new Error('The exact single-gate confirmation phrase is required before execution.');
  }

  return {
    definition,
    projectName: MAME_TO_CHA_ACCEPTANCE_TARGET.projectName,
    projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
    environment: MAME_TO_CHA_ACCEPTANCE_TARGET.environment,
    tenantSlug: MAME_TO_CHA_ACCEPTANCE_TARGET.tenantSlug,
    confirmationRequired: required,
  };
}

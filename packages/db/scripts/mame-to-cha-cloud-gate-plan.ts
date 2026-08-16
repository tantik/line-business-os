#!/usr/bin/env node
/**
 * Plan-only CLI for one Mame To Cha Cloud onboarding gate.
 *
 * It performs no network or database I/O and cannot execute a write. The
 * future executor must consume the same validated gate contract separately.
 */
import {
  MAME_TO_CHA_ACCEPTANCE_TARGET,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

export interface CloudGatePlanArgs {
  gate?: string;
  projectRef?: string;
  targetEnvironment?: string;
}
export function parseCloudGatePlanArgs(argv: readonly string[]): CloudGatePlanArgs {
  const result: CloudGatePlanArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--gate' || flag === '--project-ref' || flag === '--target-environment') {
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires one value.`);
      if (flag === '--gate') result.gate = value;
      if (flag === '--project-ref') result.projectRef = value;
      if (flag === '--target-environment') result.targetEnvironment = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${flag ?? ''}`);
  }
  return result;
}

export function buildCloudGatePlan(argv: readonly string[]): object {
  const args = parseCloudGatePlanArgs(argv);
  const validated = validateMameToChaCloudGate({
    ...args,
    mode: 'plan',
    confirm: undefined,
  });
  return {
    mode: 'plan-only',
    performsIo: false,
    executable: false,
    gate: validated.definition.gate,
    kind: validated.definition.kind,
    target: {
      projectName: validated.projectName,
      projectRef: validated.projectRef,
      environment: validated.environment,
      tenantSlug: validated.tenantSlug,
    },
    description: validated.definition.description,
    planEntities: validated.definition.planEntities,
    requiresPii: validated.definition.requiresPii,
    compensation: validated.definition.compensation,
    confirmationRequiredForFutureExecution: validated.confirmationRequired,
  };
}

function isMain(): boolean {
  const entry = process.argv[1]?.replaceAll('\\', '/');
  return entry?.endsWith('/mame-to-cha-cloud-gate-plan.ts') === true;
}

if (isMain()) {
  try {
    console.log(JSON.stringify(buildCloudGatePlan(process.argv.slice(2)), null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloud gate planning failed.';
    console.error(message);
    console.error(
      `Usage: --gate D1 --project-ref ${MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef} --target-environment acceptance`,
    );
    process.exitCode = 1;
  }
}

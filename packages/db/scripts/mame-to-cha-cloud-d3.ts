/**
 * Gate D3 executor: create only the two synthetic Mame To Cha Auth users.
 *
 * Gate/target/input validation completes before an Admin client is built.
 * Tests inject a fake client and never contact Supabase Cloud.
 */
import {
  defaultBuildSupabaseAdminClient,
  findOrCreateLocalAuthUser,
  type SupabaseAdminClient,
} from './mame-to-cha-auth.js';
import {
  type MameToChaCloudGateInput,
  MAME_TO_CHA_ACCEPTANCE_TARGET,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

export const MAME_TO_CHA_CLOUD_D3_IDENTITIES = {
  managerEmail: 'manager@mame-to-cha.test',
  staffEmail: 'staff@mame-to-cha.test',
} as const;

export interface MameToChaCloudD3Env {
  MAME_TO_CHA_CLOUD_SUPABASE_URL?: string;
  MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY?: string;
  MAME_TO_CHA_CLOUD_MANAGER_PASSWORD?: string;
  MAME_TO_CHA_CLOUD_STAFF_PASSWORD?: string;
}

export interface MameToChaCloudD3Result {
  gate: 'D3';
  tenantSlug: 'mame-to-cha';
  managerUserId: string;
  staffUserId: string;
  managerCreated: boolean;
  staffCreated: boolean;
  changedOperationCount: number;
  noop: boolean;
  target: {
    projectRef: typeof MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef;
    environment: typeof MAME_TO_CHA_ACCEPTANCE_TARGET.environment;
  };
}

export function assertMameToChaAcceptanceSupabaseUrl(supabaseUrl: string): void {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error('MAME_TO_CHA_CLOUD_SUPABASE_URL is not a valid URL.');
  }
  const expectedHost = `${MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef}.supabase.co`;
  if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.port !== '') {
    throw new Error('Cloud Auth URL does not match the reviewed acceptance project.');
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('Cloud Auth URL must be the exact project origin.');
  }
}

function requireSecret(env: MameToChaCloudD3Env, name: keyof MameToChaCloudD3Env): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export interface CloudD3Deps {
  buildClient?: (supabaseUrl: string, serviceRoleKey: string) => Promise<SupabaseAdminClient>;
}

export async function runMameToChaCloudD3FromEnv(
  gateInput: MameToChaCloudGateInput,
  env: MameToChaCloudD3Env = process.env,
  deps: CloudD3Deps = {},
): Promise<MameToChaCloudD3Result> {
  const gate = validateMameToChaCloudGate({ ...gateInput, mode: 'execute' });
  if (gate.definition.gate !== 'D3') throw new Error('This executor accepts D3 only.');

  const supabaseUrl = requireSecret(env, 'MAME_TO_CHA_CLOUD_SUPABASE_URL');
  assertMameToChaAcceptanceSupabaseUrl(supabaseUrl);
  const serviceRoleKey = requireSecret(env, 'MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY');
  const managerPassword = requireSecret(env, 'MAME_TO_CHA_CLOUD_MANAGER_PASSWORD');
  const staffPassword = requireSecret(env, 'MAME_TO_CHA_CLOUD_STAFF_PASSWORD');
  const buildClient = deps.buildClient ?? (async (url, key) => defaultBuildSupabaseAdminClient(url, key));
  const client = await buildClient(supabaseUrl, serviceRoleKey);

  let manager;
  let staff;
  try {
    manager = await findOrCreateLocalAuthUser(
      client,
      MAME_TO_CHA_CLOUD_D3_IDENTITIES.managerEmail,
      managerPassword,
    );
    staff = await findOrCreateLocalAuthUser(
      client,
      MAME_TO_CHA_CLOUD_D3_IDENTITIES.staffEmail,
      staffPassword,
    );
  } catch {
    throw new Error('Cloud D3 Auth outcome may be partial; verify identities before retrying.');
  }

  if (manager.userId === staff.userId) {
    throw new Error('Cloud D3 resolved both synthetic identities to the same Auth user; refusing.');
  }
  const changedOperationCount = Number(manager.created) + Number(staff.created);
  return {
    gate: 'D3',
    tenantSlug: MAME_TO_CHA_ACCEPTANCE_TARGET.tenantSlug,
    managerUserId: manager.userId,
    staffUserId: staff.userId,
    managerCreated: manager.created,
    staffCreated: staff.created,
    changedOperationCount,
    noop: changedOperationCount === 0,
    target: {
      projectRef: gate.projectRef,
      environment: gate.environment,
    },
  };
}

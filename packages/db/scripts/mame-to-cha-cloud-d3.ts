/**
 * Gate D3 executor: create only the two synthetic Mame To Cha Auth users.
 *
 * Gate/target/input validation completes before an Admin client is built.
 * Tests inject a fake client and never contact Supabase Cloud.
 */
import {
  defaultBuildSupabaseAdminClient,
  type SupabaseAdminClient,
  type SupabaseAdminUser,
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
  /**
   * Preferred: one `sb_secret_*` value for the mame-to-cha Cloud DEV project.
   * Falls back to the legacy `MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY`
   * during the migration (docs/operations/supabase-secret-key-migration-runbook.md).
   */
  MAME_TO_CHA_CLOUD_SUPABASE_SECRET_KEY?: string;
  /** Legacy JWT service_role key — temporary fallback only. */
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

/**
 * Privileged key for the mame-to-cha Cloud DEV project: prefer the current
 * `sb_secret_*` value, fall back to the legacy JWT during the migration.
 * Value-free error if neither is set.
 */
function requireMameToChaCloudSecretKey(env: MameToChaCloudD3Env): string {
  const secret = env.MAME_TO_CHA_CLOUD_SUPABASE_SECRET_KEY;
  if (secret !== undefined && secret.trim() !== '') return secret;
  const legacy = env.MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY;
  if (legacy !== undefined && legacy.trim() !== '') return legacy;
  throw new Error(
    'MAME_TO_CHA_CLOUD_SUPABASE_SECRET_KEY (preferred) or MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY (legacy) is required.',
  );
}

export interface CloudD3Deps {
  buildClient?: (supabaseUrl: string, serviceRoleKey: string) => Promise<SupabaseAdminClient>;
}

const AUTH_LIST_PAGE_SIZE = 200;
const AUTH_LIST_MAX_PAGES = 50;

async function findCloudAuthUser(
  client: SupabaseAdminClient,
  email: string,
): Promise<SupabaseAdminUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
    const listed = await client.listUsers({ page, perPage: AUTH_LIST_PAGE_SIZE });
    if (listed.error !== null) {
      throw new Error('Cloud D3 could not list Auth users.');
    }
    const match = listed.users.find(
      (user) => (user.email ?? '').trim().toLowerCase() === normalizedEmail,
    );
    if (match !== undefined) return match;
    if (listed.users.length < AUTH_LIST_PAGE_SIZE) return null;
  }
  throw new Error('Cloud D3 Auth user lookup exceeded the safe page limit.');
}

async function findOrCreateCloudAuthUser(
  client: SupabaseAdminClient,
  email: string,
  password: string,
): Promise<{ userId: string; created: boolean }> {
  const existing = await findCloudAuthUser(client, email);
  if (existing !== null) return { userId: existing.id, created: false };

  const created = await client.createUser({ email, password, emailConfirm: true });
  if (created.error === null && created.user !== null) {
    return { userId: created.user.id, created: true };
  }

  // A concurrent operator may have created the same fixed identity after our
  // list. Resolve that race by reading once more before failing safely.
  const raced = await findCloudAuthUser(client, email);
  if (raced !== null) return { userId: raced.id, created: false };
  throw new Error('Cloud D3 could not create the missing Auth user.');
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
  const privilegedKey = requireMameToChaCloudSecretKey(env);
  const managerPassword = requireSecret(env, 'MAME_TO_CHA_CLOUD_MANAGER_PASSWORD');
  const staffPassword = requireSecret(env, 'MAME_TO_CHA_CLOUD_STAFF_PASSWORD');
  const buildClient = deps.buildClient ?? (async (url, key) => defaultBuildSupabaseAdminClient(url, key));
  const client = await buildClient(supabaseUrl, privilegedKey);

  let manager;
  let staff;
  try {
    manager = await findOrCreateCloudAuthUser(
      client,
      MAME_TO_CHA_CLOUD_D3_IDENTITIES.managerEmail,
      managerPassword,
    );
    staff = await findOrCreateCloudAuthUser(
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

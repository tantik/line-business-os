/**
 * Local-only Supabase Auth admin provisioning for the Mame To Cha fixture
 * (Phase 1N-4C Slice C1 completion).
 *
 * SCOPE — this is a dedicated, LOCAL-ONLY CLI/script module, deliberately
 * kept OUTSIDE `apps/web` (it is never imported by the web app -- verified
 * by `apps/web does not import any onboarding script`-style tests, mirrored
 * for this file in `mame-to-cha-auth.test.ts`). It is the only file in this
 * tool that talks to the Supabase Auth Admin API (never the Data API, never
 * `core`/`workforce` tables directly):
 *
 *   - it reads the local Supabase URL and a LOCAL service-role key ONLY from
 *     environment variables named `MAME_TO_CHA_LOCAL_SUPABASE_URL` /
 *     `MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY` -- never a
 *     `NEXT_PUBLIC_*` variable, and this file is never reachable from the
 *     browser bundle,
 *   - `assertLocalSupabaseUrl` rejects any non-loopback host and any
 *     `*.supabase.co`/`*.pooler.supabase.com` host BEFORE constructing any
 *     admin client or making any network call,
 *   - manager/staff email + password come ONLY from
 *     `MAME_TO_CHA_LOCAL_MANAGER_EMAIL`/`_PASSWORD` and
 *     `MAME_TO_CHA_LOCAL_STAFF_EMAIL`/`_PASSWORD` (the same env var NAMES
 *     `mame-to-cha-env-guard.ts` already validates the presence of) --
 *     never a hardcoded or committed value,
 *   - every email is checked against `looksLikeLocalTestEmail` before any
 *     admin call is made, so a real client email is never silently
 *     provisioned as a local test identity,
 *   - find-or-create is idempotent: a second run against an already-
 *     provisioned email finds the existing user (via a fully-injectable
 *     {@link SupabaseAdminClient}) instead of creating a duplicate,
 *   - the password and the full email are NEVER included in any returned
 *     result, log line, or thrown error -- only a boolean `created` flag
 *     and the resulting user id are ever surfaced.
 *
 * This module is fully implemented and unit-tested (a fake admin client;
 * no network call in tests) but is NEVER invoked in this task -- the CLI's
 * `auth-provision` subcommand requires the local guard, and this task's own
 * restrictions forbid creating an Auth user.
 */
import { looksLikeLocalTestEmail } from './mame-to-cha-env-guard.js';

const ALLOWED_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** Validate that a Supabase URL is LOCAL-only. Throws before any network use. */
export function assertLocalSupabaseUrl(supabaseUrl: string): void {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error('MAME_TO_CHA_LOCAL_SUPABASE_URL is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MAME_TO_CHA_LOCAL_SUPABASE_URL must use http(s).');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.endsWith('.supabase.co') || host.endsWith('.pooler.supabase.com')) {
    throw new Error('Refusing a Supabase Cloud-like host; Auth provisioning is local-only.');
  }
  if (!ALLOWED_LOCAL_HOSTS.has(host)) {
    throw new Error('MAME_TO_CHA_LOCAL_SUPABASE_URL host is not an allowed local host (expected 127.0.0.1 or localhost).');
  }
}

/** Minimal env shape this module reads. Never `NEXT_PUBLIC_*`; never logged. */
export interface MameToChaAuthEnv {
  MAME_TO_CHA_LOCAL_SUPABASE_URL?: string;
  MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY?: string;
  MAME_TO_CHA_LOCAL_MANAGER_EMAIL?: string;
  MAME_TO_CHA_LOCAL_MANAGER_PASSWORD?: string;
  MAME_TO_CHA_LOCAL_STAFF_EMAIL?: string;
  MAME_TO_CHA_LOCAL_STAFF_PASSWORD?: string;
}

/** Minimal admin-user shape this module reads (never re-exported with PII beyond id). */
export interface SupabaseAdminUser {
  id: string;
  email?: string | null;
}

/**
 * Minimal Supabase Auth Admin API surface this module needs -- fully
 * injectable so tests never construct a real `@supabase/supabase-js` client
 * or make a network call. The default implementation (used only when
 * actually invoked, never in this task) adapts `createClient(...).auth.admin`.
 */
export interface SupabaseAdminClient {
  listUsers(params: { page: number; perPage: number }): Promise<{
    users: SupabaseAdminUser[];
    error: string | null;
  }>;
  createUser(params: { email: string; password: string; emailConfirm: boolean }): Promise<{
    user: SupabaseAdminUser | null;
    error: string | null;
  }>;
}

const MAX_LIST_PAGES = 50;
const LIST_PAGE_SIZE = 200;

/** Substrings (lowercased) that indicate "this email is already registered". */
const ALREADY_REGISTERED_MARKERS = ['already been registered', 'already registered', 'already exists', 'duplicate'];

function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return ALREADY_REGISTERED_MARKERS.some((marker) => lower.includes(marker));
}

export interface FindOrCreateResult {
  userId: string;
  created: boolean;
}

/**
 * Idempotently find-or-create a local Supabase Auth user by email. Attempts
 * `createUser` first; on an "already registered" error, paginates
 * `listUsers` to find the existing user by case-insensitive email match.
 * NEVER returns or logs the password; the email is used only as an
 * in-memory lookup key, never echoed in a thrown error.
 */
export async function findOrCreateLocalAuthUser(
  client: SupabaseAdminClient,
  email: string,
  password: string,
): Promise<FindOrCreateResult> {
  const created = await client.createUser({ email, password, emailConfirm: true });
  if (created.error === null) {
    if (created.user === null) {
      throw new Error('Auth admin createUser reported success but returned no user.');
    }
    return { userId: created.user.id, created: true };
  }

  if (!isAlreadyRegisteredError(created.error)) {
    throw new Error('Auth admin createUser failed for a reason other than "already registered".');
  }

  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const listed = await client.listUsers({ page, perPage: LIST_PAGE_SIZE });
    if (listed.error !== null) {
      throw new Error('Auth admin listUsers failed while resolving an existing user.');
    }
    const match = listed.users.find((u) => (u.email ?? '').trim().toLowerCase() === normalizedEmail);
    if (match !== undefined) {
      return { userId: match.id, created: false };
    }
    if (listed.users.length < LIST_PAGE_SIZE) break; // last page
  }

  throw new Error('Auth admin reported the user already exists but it could not be found by listing.');
}

export interface MameToChaAuthProvisionResult {
  managerUserId: string;
  staffUserId: string;
  managerCreated: boolean;
  staffCreated: boolean;
}

/**
 * Provision (idempotently find-or-create) the manager and staff local Auth
 * users for the `mame-to-cha` fixture. Fails closed BEFORE any admin call
 * when: the Supabase URL is missing/Cloud-like/malformed, the service-role
 * key is missing, any of the four email/password env vars is missing, or
 * any email does not look like an obviously local/test address. Returns
 * ONLY user ids and boolean `created` flags -- never an email or password.
 */
export async function provisionMameToChaLocalAuthUsers(
  env: MameToChaAuthEnv,
  buildClient: (supabaseUrl: string, serviceRoleKey: string) => SupabaseAdminClient,
): Promise<MameToChaAuthProvisionResult> {
  const supabaseUrl = env.MAME_TO_CHA_LOCAL_SUPABASE_URL;
  if (supabaseUrl === undefined || supabaseUrl.trim() === '') {
    throw new Error('MAME_TO_CHA_LOCAL_SUPABASE_URL is required.');
  }
  assertLocalSupabaseUrl(supabaseUrl);

  const serviceRoleKey = env.MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey === undefined || serviceRoleKey.trim() === '') {
    throw new Error('MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY is required.');
  }

  const managerEmail = env.MAME_TO_CHA_LOCAL_MANAGER_EMAIL;
  const managerPassword = env.MAME_TO_CHA_LOCAL_MANAGER_PASSWORD;
  const staffEmail = env.MAME_TO_CHA_LOCAL_STAFF_EMAIL;
  const staffPassword = env.MAME_TO_CHA_LOCAL_STAFF_PASSWORD;

  for (const [name, value] of [
    ['MAME_TO_CHA_LOCAL_MANAGER_EMAIL', managerEmail],
    ['MAME_TO_CHA_LOCAL_MANAGER_PASSWORD', managerPassword],
    ['MAME_TO_CHA_LOCAL_STAFF_EMAIL', staffEmail],
    ['MAME_TO_CHA_LOCAL_STAFF_PASSWORD', staffPassword],
  ] as const) {
    if (value === undefined || value.trim() === '') {
      throw new Error(`${name} is required.`);
    }
  }

  if (!looksLikeLocalTestEmail(managerEmail as string)) {
    throw new Error('MAME_TO_CHA_LOCAL_MANAGER_EMAIL does not look like an obviously local/test address; refusing to provision what may be a real client email.');
  }
  if (!looksLikeLocalTestEmail(staffEmail as string)) {
    throw new Error('MAME_TO_CHA_LOCAL_STAFF_EMAIL does not look like an obviously local/test address; refusing to provision what may be a real client email.');
  }

  const client = buildClient(supabaseUrl, serviceRoleKey);

  const manager = await findOrCreateLocalAuthUser(client, managerEmail as string, managerPassword as string);
  const staff = await findOrCreateLocalAuthUser(client, staffEmail as string, staffPassword as string);

  return {
    managerUserId: manager.userId,
    staffUserId: staff.userId,
    managerCreated: manager.created,
    staffCreated: staff.created,
  };
}

/**
 * Default admin-client builder: lazy `@supabase/supabase-js` import so this
 * module stays dependency-free until actually invoked (never in this task).
 */
export async function defaultBuildSupabaseAdminClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<SupabaseAdminClient> {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    listUsers: async ({ page, perPage }) => {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage });
      return { users: data?.users ?? [], error: error?.message ?? null };
    },
    createUser: async ({ email, password, emailConfirm }) => {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: emailConfirm,
      });
      return { user: data?.user ?? null, error: error?.message ?? null };
    },
  };
}

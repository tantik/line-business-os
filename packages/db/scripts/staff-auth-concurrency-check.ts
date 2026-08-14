/**
 * STAFF_AUTH_PROVISIONING -- local concurrency verification.
 *
 * Empirically exercises three real race windows in the Staff invitation
 * flow using TWO GENUINE `pg` connections/transactions (not pgTAP, which
 * runs one connection per file and cannot express this) against the LOCAL
 * Supabase Postgres instance only. This is intentionally a small, throwaway
 * script -- no test framework, no CI wiring -- run manually:
 *
 *   pnpm --filter @line-os/db exec tsx scripts/staff-auth-concurrency-check.ts
 *
 * Requires `pnpm exec supabase start` (or a fresh `db reset`) already
 * running locally. Creates its own isolated fixture rows (own tenant) and
 * cleans them up itself, so it is safe to re-run repeatedly against a
 * shared local dev database without residue.
 *
 * Scenarios (see the README-style header on each `run*` function below for
 * what is actually verified -- final DB STATE, not just which call
 * returned an error):
 *   A. accept + accept on the same pending invitation
 *   B. invite/upsert + invite/upsert for the same employee
 *   C. accept + revoke collision on the same invitation
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function assertLocalDbUrl(connectionString: string): void {
  const url = new URL(connectionString);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run the concurrency check against a non-local database host (${url.hostname}). ` +
        'This script issues raw superuser-role-hop SQL and must never run against Preview/Production.',
    );
  }
}

const DB_URL = process.env.STAFF_AUTH_CONCURRENCY_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
assertLocalDbUrl(DB_URL);

const MANAGER_ROLE_ID = '00000000-0000-0000-0000-000000000005';

async function newClient(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

/** Begins a transaction, sets the JWT sub claim + authenticated role -- matches every pgTAP file's own role-hop pattern. */
async function beginAs(client: Client, sub: string | null): Promise<void> {
  await client.query('begin');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: sub ?? '', role: 'authenticated' })]);
  await client.query(`select set_config('app.current_user_id', '', true)`);
  await client.query('set local role authenticated');
}

interface CallOutcome {
  ok: boolean;
  rows?: unknown[];
  errorCode?: string;
  errorMessage?: string;
}

/** Runs one statement to completion (success or error) then commits/rolls back on the SAME connection -- the unit of "one concurrent operation" for every scenario below. */
async function runAndFinish(client: Client, sql: string, params: unknown[]): Promise<CallOutcome> {
  try {
    const result = await client.query(sql, params);
    await client.query('commit');
    return { ok: true, rows: result.rows };
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      /* connection may already be aborted; ignore */
    }
    const pgErr = err as { code?: string; message?: string };
    return { ok: false, errorCode: pgErr.code, errorMessage: pgErr.message };
  } finally {
    await client.end();
  }
}

let failures = 0;
function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} -- ${detail}`);
  }
}

async function withSuperuser<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await newClient();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Fresh, isolated fixture set for one scenario: a tenant, a location, a manager (location-scoped role -- the realistic case), and an unbound employee. Returns ids needed by the scenario. */
async function makeFixture(client: Client, label: string) {
  const tenantId = randomUUID();
  const locationId = randomUUID();
  const managerUserId = randomUUID();
  const employeeId = randomUUID();

  await client.query(`insert into core.tenants (id, slug, name) values ($1, $2, $3)`, [tenantId, `concurrency-${label}-${tenantId.slice(0, 8)}`, `Concurrency ${label}`]);
  await client.query(`insert into core.locations (id, tenant_id, name) values ($1, $2, 'Loc')`, [locationId, tenantId]);
  await client.query(`insert into core.users (id, display_name) values ($1, 'Manager')`, [managerUserId]);
  await client.query(`insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values ($1, $2, $3, $4)`, [
    tenantId,
    managerUserId,
    MANAGER_ROLE_ID,
    locationId,
  ]);
  await client.query(`insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values ($1, $2, $3, null, '\\x00')`, [
    employeeId,
    tenantId,
    locationId,
  ]);

  return { tenantId, locationId, managerUserId, employeeId };
}

/**
 * A. accept + accept on the same pending invitation.
 * Setup: one pending invitation targeting person X.
 * Fires: TWO concurrent `api.accept_employee_invitation` calls, both authenticated as X.
 * Invariants checked against FINAL DB STATE (not just which call errored):
 *   - exactly one of the two calls succeeded;
 *   - the invitation is `accepted` exactly once (accepted_at set exactly once, never overwritten);
 *   - workforce.employees.user_id is bound to X exactly once, deterministically;
 *   - exactly one active core.tenant_memberships row for (tenant, X);
 *   - exactly one core.role_assignments row for (tenant, X, employee role) -- no duplicate grant.
 */
async function runAcceptAcceptScenario(): Promise<void> {
  console.log('\n=== A. accept + accept on the same pending invitation ===');
  const { tenantId, employeeId, managerUserId } = await withSuperuser((c) => makeFixture(c, 'accept-accept'));
  const personX = randomUUID();
  const invitationId = randomUUID();

  await withSuperuser(async (c) => {
    await c.query(`insert into core.users (id, display_name) values ($1, 'Person X')`, [personX]);
    await beginAs(c, managerUserId);
    await c.query(`select * from api.upsert_employee_invitation($1, $2, $3, $4)`, [tenantId, employeeId, personX, invitationId]);
    await c.query('commit');
  });

  const c1 = await newClient();
  const c2 = await newClient();
  await beginAs(c1, personX);
  await beginAs(c2, personX);

  const [r1, r2] = await Promise.all([
    runAndFinish(c1, `select * from api.accept_employee_invitation($1)`, [invitationId]),
    runAndFinish(c2, `select * from api.accept_employee_invitation($1)`, [invitationId]),
  ]);

  const succeeded = [r1, r2].filter((r) => r.ok);
  const failed = [r1, r2].filter((r) => !r.ok);
  console.log(`  call 1: ${r1.ok ? 'succeeded' : `failed (${r1.errorMessage})`}`);
  console.log(`  call 2: ${r2.ok ? 'succeeded' : `failed (${r2.errorMessage})`}`);

  await withSuperuser(async (c) => {
    const inv = await c.query(`select status, accepted_at from workforce.employee_invitations where id = $1`, [invitationId]);
    const emp = await c.query(`select user_id from workforce.employees where id = $1`, [employeeId]);
    const memberships = await c.query(`select status from core.tenant_memberships where tenant_id = $1 and user_id = $2`, [tenantId, personX]);
    const roles = await c.query(`select count(*)::int as n from core.role_assignments where tenant_id = $1 and user_id = $2`, [tenantId, personX]);

    check('exactly one accept succeeded', succeeded.length === 1 && failed.length === 1, `succeeded=${succeeded.length} failed=${failed.length}`);
    check('invitation is accepted exactly once', inv.rows[0]?.status === 'accepted' && inv.rows[0]?.accepted_at !== null, JSON.stringify(inv.rows[0]));
    check('employee.user_id bound to X, deterministic', emp.rows[0]?.user_id === personX, JSON.stringify(emp.rows[0]));
    check('exactly one active tenant membership', memberships.rows.length === 1 && memberships.rows[0]?.status === 'active', JSON.stringify(memberships.rows));
    check('exactly one role_assignment row (no duplicate grant)', roles.rows[0]?.n === 1, JSON.stringify(roles.rows[0]));

    await c.query(`delete from workforce.employee_invitations where id = $1`, [invitationId]);
    await c.query(`delete from core.role_assignments where tenant_id = $1`, [tenantId]);
    await c.query(`delete from core.tenant_memberships where tenant_id = $1`, [tenantId]);
    await c.query(`delete from workforce.employees where id = $1`, [employeeId]);
    await c.query(`delete from core.locations where tenant_id = $1`, [tenantId]);
    await c.query(`delete from core.tenants where id = $1`, [tenantId]);
    await c.query(`delete from core.users where id in ($1, $2)`, [personX, managerUserId]);
  });
}

/**
 * B. invite/upsert + invite/upsert for the same employee (simulating two
 * near-simultaneous Manager Invite/Resend clicks, or a Resend racing a
 * fresh Invite, each having independently resolved a target user id via
 * the Edge Function's own Auth Admin API call).
 * Fires: TWO concurrent `api.upsert_employee_invitation` calls for the same
 * (tenant, employee), different target_user_id/invitation_id each.
 * Invariant checked against FINAL DB STATE:
 *   - never more than one row in workforce.employee_invitations for this
 *     employee (never a duplicate pending row -- the actual named
 *     invariant from the task brief), regardless of whether the losing
 *     call errored (23505) or transparently refreshed the winner's row.
 */
async function runInviteInviteScenario(): Promise<void> {
  console.log('\n=== B. invite/upsert + invite/upsert for the same employee ===');
  const { tenantId, employeeId, managerUserId } = await withSuperuser((c) => makeFixture(c, 'invite-invite'));
  const targetA = randomUUID();
  const targetB = randomUUID();
  const invitationA = randomUUID();
  const invitationB = randomUUID();

  await withSuperuser(async (c) => {
    await c.query(`insert into core.users (id, display_name) values ($1, 'Target A'), ($2, 'Target B')`, [targetA, targetB]);
  });

  const c1 = await newClient();
  const c2 = await newClient();
  await beginAs(c1, managerUserId);
  await beginAs(c2, managerUserId);

  const [r1, r2] = await Promise.all([
    runAndFinish(c1, `select * from api.upsert_employee_invitation($1, $2, $3, $4)`, [tenantId, employeeId, targetA, invitationA]),
    runAndFinish(c2, `select * from api.upsert_employee_invitation($1, $2, $3, $4)`, [tenantId, employeeId, targetB, invitationB]),
  ]);

  console.log(`  call 1 (target A): ${r1.ok ? 'succeeded' : `failed (${r1.errorCode}: ${r1.errorMessage})`}`);
  console.log(`  call 2 (target B): ${r2.ok ? 'succeeded' : `failed (${r2.errorCode}: ${r2.errorMessage})`}`);

  await withSuperuser(async (c) => {
    const rows = await c.query(`select id, target_user_id, status from workforce.employee_invitations where tenant_id = $1 and employee_id = $2`, [
      tenantId,
      employeeId,
    ]);

    check('never more than one row for this employee', rows.rows.length === 1, `found ${rows.rows.length} rows: ${JSON.stringify(rows.rows)}`);
    const bothSucceeded = r1.ok && r2.ok;
    const oneFailedWithUniqueViolation =
      (r1.ok && !r2.ok && r2.errorCode === '23505') || (r2.ok && !r1.ok && r1.errorCode === '23505');
    check(
      'either both calls safely refreshed the same row, or the loser failed with the unique-violation code (23505), never anything else',
      bothSucceeded || oneFailedWithUniqueViolation,
      `r1=${JSON.stringify(r1)} r2=${JSON.stringify(r2)}`,
    );

    await c.query(`delete from workforce.employee_invitations where tenant_id = $1`, [tenantId]);
    await c.query(`delete from core.role_assignments where tenant_id = $1`, [tenantId]);
    await c.query(`delete from workforce.employees where id = $1`, [employeeId]);
    await c.query(`delete from core.locations where tenant_id = $1`, [tenantId]);
    await c.query(`delete from core.tenants where id = $1`, [tenantId]);
    await c.query(`delete from core.users where id in ($1, $2, $3)`, [targetA, targetB, managerUserId]);
  });
}

/**
 * C. accept + revoke collision on the same invitation.
 * Setup: one pending invitation targeting person X.
 * Fires: a concurrent accept (as X) and revoke (as the Manager, via the
 * exact `api.workforce_employee_invitations` view UPDATE the Manager UI
 * itself issues).
 * Invariant checked against FINAL DB STATE:
 *   - exactly one of {accepted, revoked} is the final state -- never both,
 *     never neither;
 *   - if accepted won: workforce.employees.user_id is bound, and the
 *     invitation's status is `accepted` (the revoke lost cleanly, 0 rows
 *     affected, never silently overwriting an accepted row);
 *   - if revoked won: workforce.employees.user_id is still null (accept
 *     lost cleanly, no partial bind), and no tenant membership/role was
 *     granted.
 */
async function runAcceptRevokeScenario(dispatchOrder: 'accept-first' | 'revoke-first'): Promise<void> {
  console.log(`\n=== C. accept + revoke collision on the same invitation (${dispatchOrder}) ===`);
  const { tenantId, employeeId, managerUserId } = await withSuperuser((c) => makeFixture(c, 'accept-revoke'));
  const personX = randomUUID();
  const invitationId = randomUUID();

  await withSuperuser(async (c) => {
    await c.query(`insert into core.users (id, display_name) values ($1, 'Person X')`, [personX]);
    await beginAs(c, managerUserId);
    await c.query(`select * from api.upsert_employee_invitation($1, $2, $3, $4)`, [tenantId, employeeId, personX, invitationId]);
    await c.query('commit');
  });

  const c1 = await newClient();
  const c2 = await newClient();
  await beginAs(c1, personX);
  await beginAs(c2, managerUserId);

  const acceptCall = () => runAndFinish(c1, `select * from api.accept_employee_invitation($1)`, [invitationId]);
  const revokeCall = () =>
    runAndFinish(
      c2,
      `update api.workforce_employee_invitations set status = 'revoked', revoked_at = now() where invitation_id = $1 returning invitation_id`,
      [invitationId],
    );
  // Dispatch order matters: Promise.all evaluates array elements left-to-right
  // synchronously, so whichever call is LISTED first also starts its network
  // round-trip first -- exercising both orders is what actually proves BOTH
  // "accept wins" and "revoke wins" invariants, not just whichever one this
  // script happens to list first.
  const [accept, revoke] =
    dispatchOrder === 'accept-first' ? await Promise.all([acceptCall(), revokeCall()]) : (await Promise.all([revokeCall(), acceptCall()])).reverse() as [CallOutcome, CallOutcome];

  const revokeAffectedRows = revoke.ok ? (revoke.rows?.length ?? 0) : 0;
  console.log(`  accept: ${accept.ok ? 'succeeded' : `failed (${accept.errorMessage})`}`);
  console.log(`  revoke: ${revoke.ok ? `succeeded (${revokeAffectedRows} row(s) affected)` : `failed (${revoke.errorMessage})`}`);

  await withSuperuser(async (c) => {
    const inv = await c.query(`select status from workforce.employee_invitations where id = $1`, [invitationId]);
    const emp = await c.query(`select user_id from workforce.employees where id = $1`, [employeeId]);
    const memberships = await c.query(`select count(*)::int as n from core.tenant_memberships where tenant_id = $1 and user_id = $2 and status = 'active'`, [
      tenantId,
      personX,
    ]);
    const finalStatus = inv.rows[0]?.status as string;

    check('final invitation status is exactly one of accepted/revoked', finalStatus === 'accepted' || finalStatus === 'revoked', finalStatus);

    if (finalStatus === 'accepted') {
      check('accept won: employee is bound', emp.rows[0]?.user_id === personX, JSON.stringify(emp.rows[0]));
      check('accept won: revoke affected 0 rows (lost cleanly, no overwrite)', revokeAffectedRows === 0, `revokeAffectedRows=${revokeAffectedRows}`);
    } else {
      check('revoke won: employee is NOT bound (no partial bind)', emp.rows[0]?.user_id === null, JSON.stringify(emp.rows[0]));
      check('revoke won: accept call did not report success', !accept.ok, JSON.stringify(accept));
      check('revoke won: no active tenant membership was granted', memberships.rows[0]?.n === 0, JSON.stringify(memberships.rows[0]));
    }

    await c.query(`delete from workforce.employee_invitations where id = $1`, [invitationId]);
    await c.query(`delete from core.role_assignments where tenant_id = $1`, [tenantId]);
    await c.query(`delete from core.tenant_memberships where tenant_id = $1`, [tenantId]);
    await c.query(`delete from workforce.employees where id = $1`, [employeeId]);
    await c.query(`delete from core.locations where tenant_id = $1`, [tenantId]);
    await c.query(`delete from core.tenants where id = $1`, [tenantId]);
    await c.query(`delete from core.users where id in ($1, $2)`, [personX, managerUserId]);
  });
}

async function main() {
  await runAcceptAcceptScenario();
  await runInviteInviteScenario();
  await runAcceptRevokeScenario('accept-first');
  await runAcceptRevokeScenario('revoke-first');

  console.log(`\n${failures === 0 ? 'ALL CONCURRENCY INVARIANTS HELD' : `${failures} INVARIANT(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Concurrency check crashed:', err);
  process.exit(1);
});

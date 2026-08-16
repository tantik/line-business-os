/**
 * Gate D7 executor: run the complete Mame To Cha verification checklist
 * against the reviewed acceptance project in an explicitly read-only
 * transaction. This module has no write or commit path.
 */
import { Client } from 'pg';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import {
  runMameToChaVerifyChecks,
  type MameToChaVerifyReport,
} from './mame-to-cha-verify.js';
import {
  validateMameToChaIdentityOrThrow,
  type MameToChaFixtureIdentity,
} from './mame-to-cha-state.js';
import {
  assertMameToChaAcceptanceDatabaseUrl,
  type CloudDatabaseTarget,
} from './mame-to-cha-cloud-d1.js';
import {
  type MameToChaCloudGateInput,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

export const MAME_TO_CHA_CLOUD_D7_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  beginReadOnly: 'begin read only',
  rollback: 'rollback',
} as const;

export interface CloudD7Client {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface CloudD7Deps {
  createClient?: (connectionString: string) => CloudD7Client;
  assertDatabaseUrl?: (databaseUrl: string) => CloudDatabaseTarget;
  verify?: typeof runMameToChaVerifyChecks;
}

function createDefaultClient(connectionString: string): CloudD7Client {
  const client = new Client({ connectionString });
  return {
    connect: async () => { await client.connect(); },
    query: async (text, values) => {
      const result = await client.query(text, values ? Array.from(values) : undefined);
      return { rows: result.rows };
    },
    end: async () => client.end(),
  };
}

export async function runMameToChaCloudD7FromEnv(
  gateInput: MameToChaCloudGateInput,
  identity: MameToChaFixtureIdentity,
  env: { MAME_TO_CHA_CLOUD_DATABASE_URL?: string } = process.env,
  deps: CloudD7Deps = {},
): Promise<MameToChaVerifyReport & { gate: 'D7'; target: CloudDatabaseTarget; readOnly: true }> {
  const gate = validateMameToChaCloudGate({ ...gateInput, mode: 'execute' });
  if (gate.definition.gate !== 'D7') throw new Error('This executor accepts D7 only.');
  validateMameToChaIdentityOrThrow(identity);

  const databaseUrl = env.MAME_TO_CHA_CLOUD_DATABASE_URL;
  if (!databaseUrl) throw new Error('MAME_TO_CHA_CLOUD_DATABASE_URL is required for D7.');
  const target = (deps.assertDatabaseUrl ?? assertMameToChaAcceptanceDatabaseUrl)(databaseUrl);
  const client = (deps.createClient ?? createDefaultClient)(databaseUrl);
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => undefined);
    throw new Error('Could not connect to the reviewed Cloud acceptance database.');
  }

  let began = false;
  try {
    await client.query(MAME_TO_CHA_CLOUD_D7_SQL.statementTimeout);
    await client.query(MAME_TO_CHA_CLOUD_D7_SQL.beginReadOnly);
    began = true;
    const runner: QueryRunner = {
      query: async <R = unknown>(text: string, values?: readonly unknown[]) => {
        const result = await client.query(text, values);
        return { rows: result.rows as R[] };
      },
    };
    const report = await (deps.verify ?? runMameToChaVerifyChecks)(
      runner,
      MAME_TO_CHA_FIXTURE,
      identity,
    );
    await client.query(MAME_TO_CHA_CLOUD_D7_SQL.rollback);
    began = false;
    return { ...report, gate: 'D7', target, readOnly: true };
  } catch {
    if (began) await client.query(MAME_TO_CHA_CLOUD_D7_SQL.rollback).catch(() => undefined);
    throw new Error('Cloud D7 verification failed safely; no write was attempted.');
  } finally {
    await client.end().catch(() => undefined);
  }
}

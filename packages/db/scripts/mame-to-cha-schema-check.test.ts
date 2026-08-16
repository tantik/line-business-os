import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_FUNCTIONS,
  REQUIRED_RELATIONS,
  runSchemaExistenceChecks,
  type QueryRunner,
} from './mame-to-cha-schema-check.js';

function fakeRunnerAllExist(): QueryRunner {
  return {
    async query<T = unknown>() {
      return { rows: [{ exists: true }] as T[] };
    },
  };
}

test('reports ok when every relation and function exists', async () => {
  const report = await runSchemaExistenceChecks(fakeRunnerAllExist());
  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
  assert.equal(report.relations.length, REQUIRED_RELATIONS.length);
  assert.equal(report.functions.length, REQUIRED_FUNCTIONS.length);
});

test('reports the missing relation/function by name when absent', async () => {
  let call = 0;
  const runner: QueryRunner = {
    async query<T = unknown>() {
      call += 1;
      // Make the very first relation ("core.tenants") appear missing; everything else exists.
      return { rows: [{ exists: call !== 1 }] as T[] };
    },
  };
  const report = await runSchemaExistenceChecks(runner);
  assert.equal(report.ok, false);
  assert.ok(report.missing.some((m) => m.startsWith('core.tenants')));
});

test('every check is a read against information_schema only', async () => {
  const queries: string[] = [];
  const runner: QueryRunner = {
    async query<T = unknown>(text: string) {
      queries.push(text);
      return { rows: [{ exists: true }] as T[] };
    },
  };
  await runSchemaExistenceChecks(runner);
  assert.ok(queries.every((q) => /information_schema/.test(q)));
  assert.ok(queries.every((q) => /^select/i.test(q.trim())));
});

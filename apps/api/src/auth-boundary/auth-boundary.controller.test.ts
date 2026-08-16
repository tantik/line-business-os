import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural checks on the controller/service source (mirroring
 * apps/web/src/lib/tenant/admin-members.test.ts's approach). These do not
 * require booting Nest or a live Supabase instance - they guard the auth
 * boundary's hard constraints directly against the source text.
 *
 * Resolved from `process.cwd()` (the package root, however this test is
 * invoked/compiled) rather than `__dirname`, so the check still finds the
 * real `.ts` source even when this test runs from a compiled `dist` copy.
 */
function readSource(relativeFile: string): string {
  return readFileSync(join(process.cwd(), 'src', 'auth-boundary', relativeFile), 'utf8');
}

test('controller never uses service_role or createServiceClient', () => {
  const source = readSource('./auth-boundary.controller.ts');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
});

test('controller never calls .schema("core") or .schema("audit")', () => {
  const source = readSource('./auth-boundary.controller.ts');
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]audit['"]\s*\)`).test(source));
});

test('controller hardcodes the permission and reads it from no request input', () => {
  const source = readSource('./auth-boundary.controller.ts');
  assert.ok(source.includes('PERMISSIONS.core.auditRead'));
  assert.ok(!/@Query\(\s*['"]permission['"]/.test(source));
  assert.ok(!/@Body\(/.test(source));
  assert.ok(!/@Headers\(\s*['"]x-permission['"]/i.test(source));
});

test('service never uses service_role, createServiceClient, or core/audit schemas', () => {
  const source = readSource('./auth-boundary.service.ts');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]audit['"]\s*\)`).test(source));
});

test('AuthBoundaryResult carries no message/error field on the unexpected_error branch', () => {
  const source = readSource('./auth-boundary.service.ts');
  // The type union member must be exactly `{ status: 'unexpected_error' }` -
  // no `message`/`error`/`cause` field that could carry raw Supabase/Postgres text.
  assert.ok(/\{\s*status:\s*'unexpected_error'\s*\}/.test(source));
});

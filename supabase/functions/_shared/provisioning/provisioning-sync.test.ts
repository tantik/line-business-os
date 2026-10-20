import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROVISIONING_FILES,
  PROVISIONING_HEADER_PREFIX,
  PROVISIONING_SOURCE_DIR,
  PROVISIONING_TARGET_DIR,
  transformProvisioningSource,
} from '../../../../scripts/sync-edge-provisioning.mjs';
import { buildProvisioningPayload as edgeBuild } from './provisioning-payload.ts';
import { buildProvisioningPayload as dbBuild } from '../../../../packages/db/scripts/provisioning-payload.ts';

/**
 * Drift guard (Stage 4B-2): the provision-tenant Edge Function's copy of the
 * provisioning input rules / template / HACCP manifest / payload validator
 * must be exactly the generated transform of `packages/db/scripts`. If this
 * fails, run `node scripts/sync-edge-provisioning.mjs` and commit.
 */

const normalize = (text: string) => text.replace(/\r\n/g, '\n');

test('committed Edge provisioning copies equal the transform of the current packages/db sources', () => {
  for (const fileName of PROVISIONING_FILES as string[]) {
    const source = readFileSync(join(PROVISIONING_SOURCE_DIR as string, fileName), 'utf8');
    const committed = readFileSync(join(PROVISIONING_TARGET_DIR as string, fileName), 'utf8');
    assert.equal(
      normalize(committed),
      transformProvisioningSource(fileName, source),
      `${fileName} drifted from packages/db/scripts -- run: node scripts/sync-edge-provisioning.mjs`,
    );
  }
});

test('generated copies are Deno-safe: header, .ts specifiers, no node: imports, no Node globals', () => {
  for (const fileName of PROVISIONING_FILES as string[]) {
    const committed = readFileSync(join(PROVISIONING_TARGET_DIR as string, fileName), 'utf8');
    assert.ok(committed.startsWith(PROVISIONING_HEADER_PREFIX as string), `${fileName} is missing the generated header`);
    assert.doesNotMatch(committed, /from\s+['"]\.{1,2}\/[^'"]+\.js['"]/, `${fileName}: relative .js specifier`);
    assert.doesNotMatch(committed, /from\s+['"]node:/, `${fileName}: node: import`);
    assert.doesNotMatch(committed, /\bprocess\.|\bBuffer\b|\brequire\(/, `${fileName}: Node global`);
    const imports = [...committed.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const spec of imports) {
      assert.ok(spec.startsWith('./'), `${fileName}: imports only sibling generated files, got ${spec}`);
      assert.ok((PROVISIONING_FILES as string[]).includes(spec.slice(2)), `${fileName}: ${spec} is not a synced file`);
    }
  }
});

test('the Edge copy builds the identical payload (one implementation, two runtimes)', () => {
  const input = { businessName: 'Sync Cafe', tenantSlug: 'sync-cafe', locationName: '本店', timezone: 'Asia/Tokyo' };
  assert.deepEqual(edgeBuild(input), dbBuild(input));
});

test('transform rewrites relative .js specifiers to .ts and adds the generated header', () => {
  const out = transformProvisioningSource('x.ts', "import type { A } from './a.js';\r\nimport { c } from 'pkg/c.js';\n") as string;
  assert.equal(out, `${PROVISIONING_HEADER_PREFIX}x.ts\nimport type { A } from './a.ts';\nimport { c } from 'pkg/c.js';\n`);
});

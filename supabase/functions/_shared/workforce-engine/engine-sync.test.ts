import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_FILES, ENGINE_SOURCE_DIR, ENGINE_TARGET_DIR, GENERATED_HEADER_PREFIX, transformEngineSource } from '../../../../scripts/sync-edge-workforce-engine.mjs';

/**
 * Drift guard (DEBT-074): the Edge Function's copy of the scheduling engine
 * must be exactly the generated transform of `packages/workforce/src`. If
 * this fails, run `node scripts/sync-edge-workforce-engine.mjs` and commit.
 */

const normalize = (text: string) => text.replace(/\r\n/g, '\n');

test('committed Edge engine copies equal the transform of the current packages/workforce sources', () => {
  for (const fileName of ENGINE_FILES as string[]) {
    const source = readFileSync(join(ENGINE_SOURCE_DIR as string, fileName), 'utf8');
    const committed = readFileSync(join(ENGINE_TARGET_DIR as string, fileName), 'utf8');
    assert.equal(
      normalize(committed),
      transformEngineSource(fileName, source),
      `${fileName} drifted from packages/workforce/src -- run: node scripts/sync-edge-workforce-engine.mjs`,
    );
  }
});

test('transform rewrites relative .js specifiers to .ts and adds the generated header', () => {
  const out = transformEngineSource(
    'x.ts',
    "import type { A } from './a.js';\r\nimport { b } from \"../b.js\";\nimport { c } from 'pkg/c.js';\n",
  ) as string;
  assert.equal(
    out,
    `${GENERATED_HEADER_PREFIX}x.ts\nimport type { A } from './a.ts';\nimport { b } from "../b.ts";\nimport { c } from 'pkg/c.js';\n`,
  );
});

test('generated copies carry no relative .js specifiers (Deno resolves real file names)', () => {
  for (const fileName of ENGINE_FILES as string[]) {
    const committed = readFileSync(join(ENGINE_TARGET_DIR as string, fileName), 'utf8');
    assert.ok(committed.startsWith(GENERATED_HEADER_PREFIX as string), `${fileName} is missing the generated header`);
    assert.doesNotMatch(committed, /from\s+['"]\.{1,2}\/[^'"]+\.js['"]/);
  }
});

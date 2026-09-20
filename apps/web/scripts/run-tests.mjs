// Discovers and runs every *.test.ts / *.test.tsx under src/ and scripts/.
//
// Replaces a hand-maintained file list in package.json ("test"), which drifted:
// new tests were silently never run and moved tests left dead paths behind
// (DEBT-038). Discovery is plain fs so it behaves the same on every Node >= 20
// and on Windows, unlike `node --test` glob support (Node 21+ only).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH_ROOTS = ['src', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.next']);
const TEST_FILE = /\.test\.tsx?$/;

function collect(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(join(dir, entry.name), out);
    } else if (TEST_FILE.test(entry.name)) {
      out.push(relative(appRoot, join(dir, entry.name)));
    }
  }
}

const files = [];
for (const root of SEARCH_ROOTS) collect(join(appRoot, root), files);
files.sort();

if (files.length === 0) {
  console.error('run-tests: no test files found; refusing to report success.');
  process.exit(1);
}

console.log(`run-tests: running ${files.length} test files`);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: appRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
